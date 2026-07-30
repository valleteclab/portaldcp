declare module 'pg' {
  export class Client {
    constructor(config?: {
      connectionString?: string;
      ssl?: { rejectUnauthorized: boolean };
    });
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<unknown>;
    end(): Promise<void>;
  }
}
