import { IsString, IsUrl } from 'class-validator';

export class StartOAuthDto {
  @IsUrl()
  redirectUri!: string;
}

export class OAuthCallbackDto {
  @IsString()
  code!: string;

  @IsString()
  state!: string;
}

export class ConnectBlueskyDto {
  @IsString()
  handle!: string;

  @IsString()
  appPassword!: string;
}
