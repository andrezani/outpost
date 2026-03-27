import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { McpService, McpMessage, McpResponse } from './mcp.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@ApiTags('MCP')
@ApiBearerAuth()
@ApiSecurity('X-API-Key')
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  /**
   * POST /api/v1/mcp
   *
   * HTTP MCP transport endpoint (Streamable HTTP, MCP spec 2024-11-05).
   * Accepts a single JSON-RPC message or a batch array.
   * Authenticated via API key (X-API-Key or Authorization: Bearer).
   *
   * MCP client config:
   * {
   *   "mcpServers": {
   *     "outpost": {
   *       "url": "https://your-server/api/v1/mcp",
   *       "headers": { "X-API-Key": "sk_xxx" }
   *     }
   *   }
   * }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'MCP JSON-RPC endpoint',
    description:
      'HTTP transport for the Model Context Protocol. ' +
      'Accepts single or batched JSON-RPC 2.0 messages. ' +
      'Exposes Outpost tools: publish_post, list_accounts, check_platform_capabilities, ' +
      'list_all_platform_capabilities, check_rate_limits, get_post_status.',
  })
  @ApiResponse({ status: 200, description: 'JSON-RPC response.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  async handle(
    @Body() body: McpMessage | McpMessage[],
    @Req() req: AuthenticatedRequest,
  ): Promise<McpResponse | McpResponse[]> {
    const orgId = req.organization.id;

    if (Array.isArray(body)) {
      return Promise.all(body.map((msg) => this.mcpService.handleMessage(msg, orgId)));
    }

    return this.mcpService.handleMessage(body, orgId);
  }
}
