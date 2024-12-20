# Azure TableStore MCP Server
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript-based MCP server that enables interaction with Azure Table Storage directly through Cline. This tool allows you to query and manage data in Azure Storage Tables.

## Features

- Query Azure Storage Tables with OData filter support
- Get table schemas to understand data structure
- List all tables in the storage account
- Detailed error handling and response information
- Simple configuration through connection string

## Installation

### Local Development Setup

1. Clone the repository:
```powershell
git clone https://github.com/zenturacp/mcp-azure-tablestorage.git
cd mcp-azure-tablestorage
```

2. Install dependencies:
```powershell
npm install
```

3. Build the server:
```powershell
npm run build
```

### NPM Installation

You can install the package globally via npm:

```bash
npm install -g dkmaker-mcp-server-tablestore
```

Or run it directly with npx:

```bash
npx dkmaker-mcp-server-tablestore
```

Note: When using npx or global installation, you'll still need to configure the AZURE_STORAGE_CONNECTION_STRING environment variable.

### Installing in Cline

To use the Azure TableStore server with Cline, you need to add it to your MCP settings configuration. The configuration file is located at:

Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

Add the following to your configuration:

```json
{
  "mcpServers": {
    "tablestore": {
      "command": "node",
      "args": ["C:/path/to/your/mcp-azure-tablestorage/build/index.js"],
      "env": {
        "AZURE_STORAGE_CONNECTION_STRING": "your_connection_string_here"  // Required: Your Azure Storage connection string
      }
    }
  }
}
```

Replace `C:/path/to/your/mcp-azure-tablestorage` with the actual path where you cloned the repository.

## Configuration

The server requires the following environment variable:

- `AZURE_STORAGE_CONNECTION_STRING`: Your Azure Storage account connection string

## Usage in Cline

⚠️ **IMPORTANT SAFETY NOTE**: The query_table tool returns a limited subset of results (default: 5 items) to protect the LLM's context window. DO NOT increase this limit unless explicitly confirmed by the user, as larger result sets can overwhelm the context window.

Once installed, you can use the Azure TableStore server through Cline. Here are some examples:

1. Querying a table:
```
Query the Users table where PartitionKey is 'ACTIVE'
```

Cline will use the query_table tool with:
```json
{
  "tableName": "Users",
  "filter": "PartitionKey eq 'ACTIVE'",
  "limit": 5  // Optional: Defaults to 5 items. WARNING: Do not increase without user confirmation
}
```

The response will include:
- Total number of items that match the query (without limit)
- Limited subset of items (default 5) for safe LLM processing
- Applied limit value

For example:
```json
{
  "totalItems": 25,
  "limit": 5,
  "items": [
    // First 5 matching items
  ]
}
```

This design allows the LLM to understand the full scope of the data while working with a manageable subset. The default limit of 5 items protects against overwhelming the LLM's context window - this limit should only be increased when explicitly confirmed by the user.

2. Getting table schema:
```
Show me the schema for the Orders table
```

Cline will use the get_table_schema tool with:
```json
{
  "tableName": "Orders"
}
```

3. Listing tables:
```
List all tables in the storage account
```

Cline will use the list_tables tool with:
```json
{}
```

## Project Structure

- `src/index.ts`: Main server implementation with Azure Table Storage interaction logic
- `build/`: Compiled JavaScript output
- `package.json`: Project dependencies and scripts

## Dependencies

- @azure/data-tables: Azure Table Storage client library
- @modelcontextprotocol/sdk: MCP server implementation toolkit

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. This means you can use, modify, distribute, and sublicense the code freely, provided you include the original copyright notice and license terms.
