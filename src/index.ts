#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import {
  TableClient,
  TableServiceClient,
} from '@azure/data-tables';

interface QueryTableArgs {
  tableName: string;
  filter?: string;
  select?: string[];
  limit?: number;
}

interface GetSchemaArgs {
  tableName: string;
}

interface ListTablesArgs {
  prefix?: string;
}

class TableStoreServer {
  private server: Server;
  private connectionString: string;

  constructor() {
    this.connectionString = process.env.CONNECTION_STRING || 'UseDevelopmentStorage=true';

    this.server = new Server(
      {
        name: 'tablestore',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'query_table',
          description: '⚠️ WARNING: This tool returns a limited subset of results (default: 5 items) to protect the LLM\'s context window. DO NOT increase this limit unless explicitly confirmed by the user.\n\n' +
            'Query data from an Azure Storage Table with optional filters.\n\n' +
            'Supported OData Filter Examples:\n' +
            '1. Simple equality:\n' +
            '   filter: "PartitionKey eq \'COURSE\'"\n' +
            '   filter: "email eq \'user@example.com\'"\n\n' +
            '2. Compound conditions:\n' +
            '   filter: "PartitionKey eq \'USER\' and email eq \'user@example.com\'"\n' +
            '   filter: "PartitionKey eq \'COURSE\' and title eq \'GDPR Training\'"\n\n' +
            '3. Numeric comparisons:\n' +
            '   filter: "age gt 25"\n' +
            '   filter: "costPrice le 100"\n\n' +
            '4. Date comparisons (ISO 8601 format):\n' +
            '   filter: "createdDate gt datetime\'2023-01-01T00:00:00Z\'"\n' +
            '   filter: "timestamp lt datetime\'2024-12-31T23:59:59Z\'"\n\n' +
            'Supported Operators:\n' +
            '- eq: Equal\n' +
            '- ne: Not equal\n' +
            '- gt: Greater than\n' +
            '- ge: Greater than or equal\n' +
            '- lt: Less than\n' +
            '- le: Less than or equal\n' +
            '- and: Logical and\n' +
            '- or: Logical or\n' +
            '- not: Logical not',
          inputSchema: {
            type: 'object',
            properties: {
              tableName: {
                type: 'string',
                description: 'Name of the table to query',
              },
              filter: {
                type: 'string',
                description: 'OData filter string. See description for examples.',
              },
              select: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Array of property names to select. Example: ["email", "username", "createdDate"]',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of items to return in response (default: 5). Note: Full query is still executed to get total count.',
                default: 5
              }
            },
            required: ['tableName'],
          },
        },
        {
          name: 'get_table_schema',
          description: 'Get property names and types from a table',
          inputSchema: {
            type: 'object',
            properties: {
              tableName: {
                type: 'string',
                description: 'Name of the table to analyze',
              },
            },
            required: ['tableName'],
          },
        },
        {
          name: 'list_tables',
          description: 'List all tables in the storage account',
          inputSchema: {
            type: 'object',
            properties: {
              prefix: {
                type: 'string',
                description: 'Optional prefix to filter table names',
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'query_table':
            const queryArgs = request.params.arguments as Record<string, unknown>;
            if (typeof queryArgs?.tableName !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'tableName is required and must be a string');
            }
            return await this.handleQueryTable({
              tableName: queryArgs.tableName,
              filter: typeof queryArgs.filter === 'string' ? queryArgs.filter : undefined,
              select: Array.isArray(queryArgs.select) ? queryArgs.select.map(String) : undefined,
              limit: typeof queryArgs.limit === 'number' ? queryArgs.limit : 5
            });
          case 'get_table_schema':
            const schemaArgs = request.params.arguments as Record<string, unknown>;
            if (typeof schemaArgs?.tableName !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'tableName is required and must be a string');
            }
            return await this.handleGetTableSchema({
              tableName: schemaArgs.tableName
            });
          case 'list_tables':
            const listArgs = request.params.arguments as ListTablesArgs;
            return await this.handleListTables(listArgs);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: unknown) {
        if (error instanceof McpError) throw error;
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
        throw new McpError(
          ErrorCode.InternalError,
          'An unexpected error occurred'
        );
      }
    });
  }

  private async handleQueryTable(args: QueryTableArgs) {
    const tableClient = TableClient.fromConnectionString(
      this.connectionString,
      args.tableName
    );

    const queryOptions: { queryOptions?: { filter?: string; select?: string[] } } = {};
    
    if (args.filter) {
      // Pass the OData filter directly to allow for all valid OData operations
      queryOptions.queryOptions = {
        filter: args.filter
      };
    }
    
    if (args.select) {
      if (!queryOptions.queryOptions) {
        queryOptions.queryOptions = {};
      }
      queryOptions.queryOptions.select = args.select;
    }

    const entities = [];
    const iterator = tableClient.listEntities(queryOptions);
    for await (const entity of iterator) {
      entities.push(entity);
    }

    // Apply limit in memory to maintain total count
    const totalItems = entities.length;
    const limit = args.limit || 5;
    const limitedEntities = entities.slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalItems,
            limit,
            items: limitedEntities
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetTableSchema(args: GetSchemaArgs) {
    const tableClient = TableClient.fromConnectionString(
      this.connectionString,
      args.tableName
    );

    const propertyMap = new Map<string, Set<string>>();
    const iterator = tableClient.listEntities();
    
    for await (const entity of iterator) {
      Object.entries(entity).forEach(([key, value]) => {
        if (!propertyMap.has(key)) {
          propertyMap.set(key, new Set());
        }
        propertyMap.get(key)?.add(typeof value);
      });
    }

    const schema = Object.fromEntries(
      Array.from(propertyMap.entries()).map(([key, types]) => [
        key,
        Array.from(types),
      ])
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(schema, null, 2),
        },
      ],
    };
  }

  private async handleListTables(args: ListTablesArgs) {
    const serviceClient = TableServiceClient.fromConnectionString(this.connectionString);
    const tables = [];
    const iterator = serviceClient.listTables();
    
    for await (const table of iterator) {
      if (table.name && (!args.prefix || table.name.startsWith(args.prefix))) {
        tables.push(table.name);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(tables, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Table Storage MCP server running on stdio');
  }
}

const server = new TableStoreServer();
server.run().catch(console.error);
