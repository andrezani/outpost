import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartOAuthDto {
  @ApiProperty({
    description: 'Redirect URI to send user to after OAuth authorization.',
    example: 'https://yourapp.com/oauth/callback',
  })
  @IsUrl()
  redirectUri!: string;
}

export class OAuthCallbackDto {
  @ApiProperty({
    description: 'Authorization code returned by the platform.',
    example: 'ab1cd2ef3',
  })
  @IsString()
  code!: string;

  @ApiProperty({
    description: 'State token from the initial OAuth request (CSRF protection).',
    example: 'randomstate123',
  })
  @IsString()
  state!: string;
}

export class ConnectBlueskyDto {
  @ApiProperty({
    description: 'Bluesky handle (with or without @).',
    example: 'user.bsky.social',
  })
  @IsString()
  handle!: string;

  @ApiProperty({
    description: 'App password generated at https://bsky.app/settings/app-passwords',
    example: 'xxxx-xxxx-xxxx-xxxx',
  })
  @IsString()
  appPassword!: string;
}
