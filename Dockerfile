###
# Stage 1: Extension Builder
###
FROM oven/bun:1.3.9@sha256:bb638d8a33d3744d4f33ab910c08de5fc7ab217a60e387628b53704afdb0a635 AS extension-builder

WORKDIR /build

# Enable Debian snapshot repository for reproducible builds
RUN <<EOF
	sed -i 's|^URIs:|# URIs:|' /etc/apt/sources.list.d/debian.sources
	sed -i 's|^# http://snapshot|URIs: http://snapshot|' /etc/apt/sources.list.d/debian.sources
EOF

RUN <<EOF
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
FROM oven/bun:1.3.9@sha256:bb638d8a33d3744d4f33ab910c08de5fc7ab217a60e387628b53704afdb0a635 AS opencode-builder

WORKDIR /build

# Enable Debian snapshot repository for reproducible builds
RUN <<EOF
	set -e
	sed -i 's|^URIs:|# URIs:|' /etc/apt/sources.list.d/debian.sources
	sed -i 's|^# http://snapshot|URIs: http://snapshot|' /etc/apt/sources.list.d/debian.sources
EOF

RUN <<EOF
	set -e
	apt-get update -o Acquire::Check-Valid-Until=false
	apt-get install -y --no-install-recommends git=1:2.47.3-0+deb13u1 ca-certificates=20250419
	rm -rf /var/lib/apt/lists/*
EOF

RUN git clone --depth 1 --branch v1.1.53 https://github.com/anomalyco/opencode.git .
RUN git fetch --tags
RUN test "$(git rev-parse HEAD)" = "579902ace6e9fb925f50b7d9fdf11a6b47895307"

# Apply patch: Add focusable={false} to Session component
RUN sed -i '/scrollAcceleration={scrollAcceleration()}/a\              focusable={false}' /build/packages/opencode/src/cli/cmd/tui/routes/session/index.tsx

RUN bun install --frozen-lockfile
RUN cd packages/opencode && bun run build -- --single

# Resolve symlinks in place for images folder
# RUN find /build/sdks/vscode/images -type l -exec sh -c 'cp -L "$1" "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;

# Use the publish script to package only, with bun only (no NPM)
RUN <<EOF
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
FROM debian:12.13-slim@sha256:74a21da88cf4b2e8fde34558376153c5cd80b00ca81da2e659387e76524edc73 AS base

# Enable Debian snapshot repository for reproducible builds
RUN <<EOF
	set -e
	sed -i 's|^URIs:|# URIs:|' /etc/apt/sources.list.d/debian.sources
	sed -i 's|^# http://snapshot|URIs: http://snapshot|' /etc/apt/sources.list.d/debian.sources
EOF

# OS dependencies
RUN <<EOF
	set -e
	apt-get update -o Acquire::Check-Valid-Until=false
	apt-get install -y --no-install-recommends ca-certificates=20230311+deb12u1 curl=7.88.1-10+deb12u14 git=1:2.39.5-0+deb12u3 openssh-client=1:9.2p1-2+deb12u5
	rm -rf /var/lib/apt/lists/*
EOF

# Copy OpenCode binary to /usr/local/bin (on PATH, executable by all users)
COPY --from=opencode-builder /build/packages/opencode/dist/opencode-linux-x64/bin/opencode /usr/local/bin/opencode
RUN chmod +x /usr/local/bin/opencode

# Install code-server (open-source VS Code: web server by Coder)
RUN <<EOF
	set -e
	curl -fsSL -o /tmp/code-server.tar.gz "https://github.com/coder/code-server/releases/download/v4.108.2/code-server-4.108.2-linux-amd64.tar.gz"
	echo "0ef733848473519c77b16085ea9f3477374db162b24f6b12edf820b3e9478fa8  /tmp/code-server.tar.gz" | sha256sum -c -
	mkdir -p /opt/code-server
	tar -xzf /tmp/code-server.tar.gz -C /opt/code-server --strip-components=1
	rm /tmp/code-server.tar.gz
EOF

# Download EditorConfig extension
RUN <<EOF
	set -e
	curl -fsSL -o /tmp/editorconfig.vsix "https://open-vsx.org/api/EditorConfig/EditorConfig/0.17.4/file/EditorConfig.EditorConfig-0.17.4.vsix"
	echo "3183d8852280c60699d148a3c54fb188ee070cf2ed5c6ca684dfb66264debfc3  /tmp/editorconfig.vsix" | sha256sum -c -
EOF

# Install extensions from packaged vsix
COPY --from=extension-builder /build/opencode-gui-0.1.0.vsix /tmp/opencode-gui-0.1.0.vsix
COPY --from=opencode-builder /build/sdks/vscode/dist/opencode.vsix /tmp/opencode.vsix
RUN /opt/code-server/bin/code-server --install-extension /tmp/opencode.vsix --install-extension /tmp/opencode-gui-0.1.0.vsix --install-extension /tmp/editorconfig.vsix

# Setup initial configuration of code-server
COPY <<EOF /root/.local/share/code-server/User/settings.json
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
RUN git config --global --add safe.directory '*'
RUN git config --global core.editor "code-server --wait"

# Create workspace directory
WORKDIR /workspace
VOLUME /workspace
EXPOSE 8080

# Use code-server directly (pre-installed, no download needed)
# Extensions are loaded from ~/.local/share/code-server/extensions by default
# Note: --disable-telemetry and --disable-workspace-trust have no env var equivalents
ENTRYPOINT ["/opt/code-server/bin/code-server", "--disable-telemetry", "--disable-workspace-trust", "--disable-update-check", "--auth", "none", "/workspace"]


###
# Bun Version
###
FROM base AS with-bun

RUN <<EOF
	set -e
	apt-get update -o Acquire::Check-Valid-Until=false
	apt-get install -y --no-install-recommends unzip=6.0-28
	rm -rf /var/lib/apt/lists/*
EOF

RUN <<EOF
	set -e
	curl -fsSL -o /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v1.3.9/bun-linux-x64.zip"
	echo "4680e80e44e32aa718560ceae85d22ecfbf2efb8f3641782e35e4b7efd65a1aa  /tmp/bun.zip" | sha256sum -c -
	unzip /tmp/bun.zip -d /tmp/bun-extract
	mv /tmp/bun-extract/bun-linux-x64/bun /usr/local/bin/bun
	chmod +x /usr/local/bin/bun
	rm -rf /tmp/bun.zip /tmp/bun-extract
EOF
