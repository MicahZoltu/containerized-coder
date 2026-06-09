###
# Stage 1: Extension Builder
###
FROM oven/bun:1.3.11@sha256:38919894db4e117a37f74e3dca503e84f24d97f19cabc5f499a289c2a5d0db7c AS extension-builder

WORKDIR /build

RUN <<EOF
	# Enable Debian snapshot repository for reproducible builds
	sed -i 's|^URIs:|# URIs:|' /etc/apt/sources.list.d/debian.sources
	sed -i 's|^# http://snapshot|URIs: http://snapshot|' /etc/apt/sources.list.d/debian.sources
EOF

RUN <<EOF
	# install dependencies
	set -e
	apt-get update -o Acquire::Check-Valid-Until=false
	apt-get install -y --no-install-recommends zip=3.0-15
	rm -rf /var/lib/apt/lists/*
EOF

# Cache dependecy layer
COPY vscode-gui-old/package.json vscode-gui-old/package-lock.json ./
RUN bun install --frozen-lockfile

# Copy remaining extension files
COPY vscode-gui-old/tsconfig.json ./
COPY vscode-gui-old/extension-host ./extension-host
COPY vscode-gui-old/script ./script
COPY vscode-gui-old/webview ./webview
COPY vscode-gui-old/README.md ./
RUN bun run package


###
# Stage 2: OpenCode Builder
###
FROM oven/bun:1.3.11@sha256:38919894db4e117a37f74e3dca503e84f24d97f19cabc5f499a289c2a5d0db7c AS opencode-builder

WORKDIR /build

RUN <<EOF
	# Enable Debian snapshot repository for reproducible builds
	set -e
	sed -i 's|^URIs:|# URIs:|' /etc/apt/sources.list.d/debian.sources
	sed -i 's|^# http://snapshot|URIs: http://snapshot|' /etc/apt/sources.list.d/debian.sources
EOF

RUN <<EOF
	# install dependencies
	set -e
	apt-get update -o Acquire::Check-Valid-Until=false
	apt-get install -y --no-install-recommends git=1:2.47.3-0+deb13u1 ca-certificates=20250419
	rm -rf /var/lib/apt/lists/*
EOF

RUN git clone --depth 1 --branch v1.3.13 https://github.com/anomalyco/opencode.git .
RUN git fetch --tags
RUN test "$(git rev-parse HEAD)" = "6314f09c14fdd6a3ab8bedc4f7b7182647551d12"

# Apply patch: Add focusable={false} to Session component
RUN sed -i '/scrollAcceleration={scrollAcceleration()}/a\              focusable={false}' /build/packages/opencode/src/cli/cmd/tui/routes/session/index.tsx

# Fix broken build reproducibility
RUN sed -i 's/ghostty-web#main/ghostty-web#4af877d52b523754f113b87084b69835b752fb2c/g' /build/packages/app/package.json

RUN bun install --ignore-scripts --frozen-lockfile
RUN cd packages/opencode && bun run build -- --single

# Resolve symlinks in place for images folder
# RUN find /build/sdks/vscode/images -type l -exec sh -c 'cp -L "$1" "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;

RUN <<EOF
	# Use the publish script to package only, with bun only (no NPM)
	set -e
	cd sdks/vscode
	sed -i -e '/vsce publish/s/^/# /' -e '/ovsx/s/^/# /' ./script/publish
	sed -i 's/^vsce package/bun x @vscode\/vsce package/' ./script/publish
	sed -i '/"vscode:prepublish":/d' ./package.json
	bun install --frozen-lockfile
	bun run package
	./script/publish
EOF


###
# Stage 3: Final Runtime Image
###
FROM ghcr.io/coder/code-server:4.121.0-trixie@sha256:607c3e129123f7e30cd5dedde2cfd3c5a0d10d81fe3bda0122b60eebf0bf7c75 AS base

RUN <<EOF
	# Enable Debian snapshot repository for reproducible builds
	set -e
	sudo sed -i 's|^URIs:|# URIs:|' /etc/apt/sources.list.d/debian.sources
	sudo sed -i 's|^# http://snapshot|URIs: http://snapshot|' /etc/apt/sources.list.d/debian.sources
EOF

# Copy OpenCode binary to /usr/local/bin (on PATH, executable by all users)
COPY --from=opencode-builder /build/packages/opencode/dist/opencode-linux-x64/bin/opencode /usr/local/bin/opencode
RUN sudo chmod +x /usr/local/bin/opencode

RUN <<EOF
	# Download EditorConfig extension
	set -e
	curl -fsSL -o /tmp/editorconfig.vsix "https://open-vsx.org/api/EditorConfig/EditorConfig/0.17.4/file/EditorConfig.EditorConfig-0.17.4.vsix"
	echo "3183d8852280c60699d148a3c54fb188ee070cf2ed5c6ca684dfb66264debfc3  /tmp/editorconfig.vsix" | sha256sum -c -
EOF

# Install extensions from packaged vsix
COPY --from=extension-builder /build/opencode-gui-0.1.0.vsix /tmp/opencode-gui-0.1.0.vsix
COPY --from=opencode-builder /build/sdks/vscode/dist/opencode.vsix /tmp/opencode.vsix
RUN /usr/bin/code-server --install-extension /tmp/opencode.vsix --install-extension /tmp/opencode-gui-0.1.0.vsix --install-extension /tmp/editorconfig.vsix

# Setup initial configuration of code-server
COPY <<EOF /home/coder/.local/share/code-server/User/settings.json
{
	"chat.disableAIFeatures": true,
	"workbench.colorTheme": "Default Dark+",
	"workbench.secondarySideBar.defaultVisibility": "hidden",
	"workbench.startupEditor": "none",
}
EOF
ENV PORT=8080
ENV CODE_SERVER_HOST=0.0.0.0
ENV CS_DISABLE_GETTING_STARTED_OVERRIDE=1
ENV APP_NAME=code-server
RUN git config --global --add safe.directory '*'
RUN git config --global core.editor "code-server --wait"

# Create workspace directory
WORKDIR /workspace
VOLUME /workspace
EXPOSE 8080

# Use code-server directly (pre-installed, no download needed)
# Extensions are loaded from ~/.local/share/code-server/extensions by default
# Note: --disable-telemetry and --disable-workspace-trust have no env var equivalents
ENTRYPOINT ["/usr/bin/code-server", "--disable-telemetry", "--disable-workspace-trust", "--disable-update-check", "--auth", "none", "--app-name", "$APP_NAME", "/workspace"]


###
# Bun Version
###
FROM base AS with-bun

RUN <<EOF
	# install dependencies
	set -e
	sudo apt-get update -o Acquire::Check-Valid-Until=false
	sudo apt-get install -y --no-install-recommends unzip=6.0-29
	sudo rm -rf /var/lib/apt/lists/*
EOF

RUN <<EOF
	# install bun
	set -e
	curl -fsSL -o /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v1.3.9/bun-linux-x64.zip"
	echo "4680e80e44e32aa718560ceae85d22ecfbf2efb8f3641782e35e4b7efd65a1aa  /tmp/bun.zip" | sha256sum -c -
	unzip /tmp/bun.zip -d /tmp/bun-extract
	sudo mv /tmp/bun-extract/bun-linux-x64/bun /usr/local/bin/bun
	sudo chmod +x /usr/local/bin/bun
	rm -rf /tmp/bun.zip /tmp/bun-extract
EOF
