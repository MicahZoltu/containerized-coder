# Containerized VSCode Web

A self-hosted VSCode Web server running in a Docker container with a custom extension pre-installed.

## Features

- **Microsoft VSCode Server** - Official VSCode CLI with `serve-web` command
- **Self-hosted** - No external relay service required
- **Pre-cached** - VSCode server binary included in image
- **No authentication** - Ready for local development use
- **Extension ready** - Scaffolded structure for custom extensions
- **Volume mount** - `/workspace` for persistent projects

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and run
docker-compose up --build

# Access VSCode Web
open http://localhost:8080
```

### Using Docker directly

```bash
# Build the image
docker build -t containerized-coder .

# Run the container
docker run -d \
	--name coder \
	-p 8080:8080 \
	-v $(pwd)/workspace:/workspace \
	containerized-coder
```

## Development

### Building the Extension

The extension source is in the `extension/` directory. It's built during the Docker image creation.

```bash
cd extension
npm install
npm run compile
npx vsce package
```

### Customizing the Extension

1. Edit files in `extension/source/`
2. Update `extension/package.json` with your extension details
3. Rebuild the Docker image

### VSCode Server Options

The server runs with these options:
- `--host 0.0.0.0` - Listen on all interfaces
- `--port 8080` - Web interface port
- `--without-connection-token` - No authentication required
- `--accept-server-license-terms` - Auto-accept license
- `--server-data-dir /workspace` - Data persistence

To modify options, edit `entrypoint.sh`.

## Project Structure

```
.
├── Dockerfile              # Multi-stage build configuration
├── docker-compose.yml      # Docker Compose configuration
├── entrypoint.sh          # Server startup script
├── extension/             # Extension source code
│   ├── package.json       # Extension manifest
│   ├── tsconfig.json      # TypeScript configuration
│   ├── .vscodeignore      # VSCode extension ignore file
    │   └── source/
    │       └── extension.ts   # Extension entry point
├── README.md              # This file
└── workspace/             # Mounted workspace (created on first run)
```

## Ports

- `8080` - VSCode Web interface

## Volumes

- `/workspace` - Working directory for projects

## License

VSCode Server is subject to Microsoft's license terms. See the [VSCode Server License](https://aka.ms/vscode-server-license).
