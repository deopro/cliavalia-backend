export default () => {
  const headersToRemove = [
    'x-powered-by',
    'server',
    'x-generator',
  ];

  return async (ctx: any, next: any) => {
    const sanitizeHeaders = () => {
      if (ctx.res.headersSent) {
        return;
      }

      for (const headerName of headersToRemove) {
        ctx.res.removeHeader(headerName);
      }
    };

    const originalWriteHead = ctx.res.writeHead;
    const originalEnd = ctx.res.end;

    ctx.res.writeHead = function (...args: any[]) {
      sanitizeHeaders();
      return originalWriteHead.apply(this, args);
    };

    ctx.res.end = function (...args: any[]) {
      sanitizeHeaders();
      return originalEnd.apply(this, args);
    };

    await next();

    sanitizeHeaders();
  };
};