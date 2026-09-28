export const jwtConstants = {
  secret: process.env.JWT_SECRET || ''
  // secret: process.env.JWT_SECRET || (() => {
  //   console.error('❌ CRITICAL: JWT_SECRET is not set in environment variables!');
  //   console.error('❌ Using fallback secret - DO NOT USE IN PRODUCTION!');
  //   return 'INSECURE_FALLBACK_SECRET_DO_NOT_USE_IN_PRODUCTION';
  // })(), // VA รอปรับใช้
}
