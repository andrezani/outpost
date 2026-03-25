import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SocialPlatform } from '@prisma/client';

export class MediaItemDto {
  @ApiProperty({
    description: 'Publicly accessible media URL.',
    example: 'https://example.com/image.jpg',
  })
  @IsUrl()
  url!: string;

  @ApiProperty({
    description: 'Media type.',
    enum: ['image', 'video'],
    example: 'image',
  })
  @IsEnum(['image', 'video'])
  type!: 'image' | 'video';

  @ApiPropertyOptional({
    description: 'Alt text for accessibility.',
    example: 'A sunset over the mountains',
  })
  @IsOptional()
  @IsString()
  altText?: string;
}

export class PostMetadataDto {
  /** Required for Reddit */
  @ApiPropertyOptional({
    description: 'Subreddit to post to (Reddit only). Required for Reddit posts.',
    example: 'programming',
  })
  @IsOptional()
  @IsString()
  subreddit?: string;

  /** Required for Reddit, optional for others */
  @ApiPropertyOptional({
    description: 'Post title (required for Reddit, optional for others).',
    example: 'Check out this new API!',
  })
  @IsOptional()
  @IsString()
  title?: string;

  /** Post ID to reply to */
  @ApiPropertyOptional({
    description: 'Post ID to reply to (for threaded replies).',
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  replyTo?: string;
}

export class PostContentDto {
  @ApiProperty({
    description: 'Post text content.',
    example: 'Hello from SocialAgent! 🤖',
  })
  @IsString()
  text!: string;

  @ApiPropertyOptional({
    description: 'Media attachments (images/videos).',
    type: [MediaItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media?: MediaItemDto[];

  @ApiPropertyOptional({
    description: 'Platform-specific metadata (subreddit, title, replyTo).',
    type: PostMetadataDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PostMetadataDto)
  metadata?: PostMetadataDto;
}

export class PublishRequestDto {
  @ApiProperty({
    description: 'Target platform.',
    enum: SocialPlatform,
    example: 'x',
  })
  @IsEnum(SocialPlatform)
  platform!: SocialPlatform;

  @ApiProperty({
    description: 'Connected account ID (from GET /api/v1/accounts).',
    example: 'cld1234abcd',
  })
  @IsString()
  accountId!: string;

  @ApiProperty({
    description: 'Post content.',
    type: PostContentDto,
  })
  @ValidateNested()
  @Type(() => PostContentDto)
  content!: PostContentDto;
}
