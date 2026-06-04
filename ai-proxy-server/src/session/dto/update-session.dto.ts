import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
