###
# Stage 1: Extension Builder
###
FROM node:24.13.0-alpine3.23@sha256:26eb49fbfdf03bf69f728b73178fa6f9e7c2cef88b06561b65497f5ae8e50a3d AS extension-builder

WORKDIR /build

# Cache dependecy layer
COPY extension/package.json extension/package-lock.json ./
RUN npm ci --ignore-scripts

# Copy remaining extension files
COPY extension/tsconfig.json ./
COPY extension/source ./source
RUN npm run compile


###
# Stage 2: Final Runtime Image
###
FROM ubuntu:24.04@sha256:a4453623f2f8319cfff65c43da9be80fe83b1a7ce689579b475867d69495b782

# OS dependencies
RUN <<EOF
	apt-get update
	apt-get install -y --no-install-recommends ca-certificates=20240203 curl=8.5.0-2ubuntu10.6 git=1:2.43.0-1ubuntu7.3
	rm -rf /var/lib/apt/lists/*
EOF

# User Management
RUN useradd -m -s /bin/bash coder
USER coder
ENV HOME=/home/coder
WORKDIR /home/coder

# Download and install VS Code CLI
RUN <<EOF
	curl -fsSL -o /tmp/vscode-cli.tar.gz "https://vscode.download.prss.microsoft.com/dbazure/download/stable/bdd88df003631aaa0bcbe057cb0a940b80a476fa/vscode_cli_alpine_x64_cli.tar.gz"
	echo "19ab98555925dbd127ed3a51a6289c6542839c32714fc6899811485f4519c6ee  /tmp/vscode-cli.tar.gz" | sha256sum -c -
	mkdir -p /home/coder/vscode-cli
	tar -xzf /tmp/vscode-cli.tar.gz -C /home/coder/vscode-cli
	chmod +x /home/coder/vscode-cli/code
	rm /tmp/vscode-cli.tar.gz
EOF

# Download and extract VS Code Server Web bundle (pre-install to avoid runtime download)
# Server must be in a directory named after the commit ID
RUN <<EOF
	curl -fsSL -o /tmp/vscode-server-web.tar.gz "https://vscode.download.prss.microsoft.com/dbazure/download/stable/bdd88df003631aaa0bcbe057cb0a940b80a476fa/vscode-server-linux-x64-web.tar.gz"
	echo "6d9446ced132e41fbd35f1c42d8fb49bf6f7cadd90e45a16d39c1bcb51230614  /tmp/vscode-server-web.tar.gz" | sha256sum -c -
	mkdir -p /home/coder/.vscode-server/bin/bdd88df003631aaa0bcbe057cb0a940b80a476fa
	tar -xzf /tmp/vscode-server-web.tar.gz -C /home/coder/.vscode-server/bin/bdd88df003631aaa0bcbe057cb0a940b80a476fa --strip-components=1
	rm /tmp/vscode-server-web.tar.gz
	# Accept server license terms by creating the license file
	mkdir -p /home/coder/.vscode-server/data
	echo "true" > /home/coder/.vscode-server/data/machine-id
	echo "accept-server-license" > /home/coder/.vscode-server/data/license-accepted
EOF

# Copy extension into VS Code Server extensions directory
RUN mkdir -p /home/coder/.vscode-server/extensions/containerized-coder-extension
COPY --from=extension-builder --chown=coder:coder /build/output /home/coder/.vscode-server/extensions/containerized-coder-extension/
COPY --from=extension-builder --chown=coder:coder /build/package.json /home/coder/.vscode-server/extensions/containerized-coder-extension/

# Set machine settings: dark theme
RUN mkdir -p /home/coder/.vscode-server/data/Machine
COPY --chown=coder:coder <<EOF /home/coder/.vscode-server/data/Machine/settings.json
{
	"workbench.colorTheme": "Default Dark+"
}
EOF

# Patch default workspace trust setting in compiled JavaScript to disable trust prompts
RUN sed -i 's/\[gbe\]:{type:"boolean",default:!0/[gbe]:{type:"boolean",default:!1/g' /home/coder/.vscode-server/bin/bdd88df003631aaa0bcbe057cb0a940b80a476fa/out/vs/code/browser/workbench/workbench.js

WORKDIR /home/coder/workspace
VOLUME /home/coder/workspace
EXPOSE 8080

# Pre-accept license by running a command during build
RUN /home/coder/vscode-cli/code --accept-server-license-terms --version || true

# Use VS Code Server directly (pre-installed, no download needed)
# Extensions are loaded from ~/.vscode-server/extensions by default
ENTRYPOINT ["/home/coder/.vscode-server/bin/bdd88df003631aaa0bcbe057cb0a940b80a476fa/bin/code-server", "--host", "0.0.0.0", "--port", "8080", "--without-connection-token", "--extensions-dir", "/home/coder/.vscode-server/extensions", "--accept-server-license-terms", "--default-folder", "/home/coder/workspace"]
