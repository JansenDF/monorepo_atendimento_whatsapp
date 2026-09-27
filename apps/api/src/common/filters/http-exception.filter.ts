import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';

interface HttpRequest {
  method: string;
  url: string;
}

interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: Record<string, unknown>): void;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const requestPath = request.url.split('?')[0] ?? request.url;
    const statusCode = exception instanceof HttpException ? exception.getStatus() : 500;
    const message = this.getPublicMessage(exception, statusCode);

    if (statusCode >= 500) {
      const internalMessage = exception instanceof Error ? exception.message : String(exception);
      const trace = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${requestPath} failed: ${internalMessage}`,
        trace,
      );
    }

    response.status(statusCode).json({
      statusCode,
      message,
      path: requestPath,
      timestamp: new Date().toISOString(),
    });
  }

  private getPublicMessage(exception: unknown, statusCode: number): unknown {
    if (statusCode >= 500) return 'Internal server error';
    if (!(exception instanceof HttpException)) return 'Request failed';

    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null && 'message' in response) {
      return response.message;
    }
    return exception.message;
  }
}
