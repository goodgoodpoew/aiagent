import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 64)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  displayName?: string;
}

export class LoginDto {
  @IsString()
  @Length(1, 120)
  account!: string;

  @IsString()
  @Length(1, 64)
  password!: string;
}
