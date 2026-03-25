import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { SocialPlatform } from '@prisma/client';

export class MediaItemDto {
  @IsUrl()
  url!: string;

  @IsEnum(['image', 'video'])
  type!: 'image' | 'video';

  @IsOptional()
  @IsString()
  altText?: string;
}

export class PostMetadataDto {
  /** Required for Reddit */
  @IsOptional()
  @IsString()
  subreddit?: string;

  /** Required for Reddit, optional for others */
  @IsOptional()
  @IsString()
  title?: string;

  /** Post ID to reply to */
  @IsOptional()
  @IsString()
  replyTo?: string;
}

export class PostContentDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media?: MediaItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PostMetadataDto)
  metadata?: PostMetadataDto;
}

export class PublishRequestDto {
  @IsEnum(SocialPlatform)
  platform!: SocialPlatform;

  @IsString()
  accountId!: string;

  @ValidateNested()
  @Type(() => PostContentDto)
  content!: PostContentDto;
}
