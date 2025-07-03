# Screaming JSON

A streaming JSON parser that emits events as it parses JSON data. This package allows you to process JSON data as it's being received, without waiting for the complete JSON document.

## Installation

```bash
npm install screaming-json
```

## Usage

```typescript
import { StreamingJSONParser } from "screaming-json";

const parser = new StreamingJSONParser();

// Process JSON data in chunks
for (const event of parser.write('{"hello": "world"}')) {
  console.log(event);
  // Outputs events like:
  // { type: 'open-object', path: [] }
  // { type: 'open-key', path: [] }
  // { type: 'append-key', path: [], delta: 'hello' }
  // { type: 'close-key', path: [], key: 'hello' }
  // { type: 'open-string', path: ['hello'] }
  // { type: 'append-string', path: ['hello'], delta: 'world' }
  // { type: 'close-string', path: ['hello'] }
  // { type: 'close-object', path: [] }
}
```

## Features

- Stream-based JSON parsing
- Event-driven architecture
- TypeScript support
- Zero dependencies

## API

### StreamingJSONParser

The main class for parsing JSON data. It provides a generator-based API that emits events as it parses JSON data.

#### Methods

- `write(str: string, terminate = false): Generator<StreamingJSONEvent>`
  - Processes a chunk of JSON data and yields events
  - `terminate` parameter indicates if this is the last chunk of data

### StreamingJSONEvent

Events emitted by the parser. Each event includes a `path` array that represents the current position in the JSON structure.

## License

MIT
