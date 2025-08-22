### screaming-json

Streaming JSON utilities for incremental parsing and event-driven consumption of JSON as it arrives. Ideal for LLM streaming responses where JSON is emitted token-by-token.

This library has no dependencies and is backed by a character-by-character state machine for parsing JSON.

### Installation

```bash
npm install screaming-json
```

### Quick start

```ts
import { JSONListener, ANY_INDEX } from "screaming-json";

const listener = new JSONListener();

// React to partial objects anywhere under an array.
listener.onPartial(["output", ANY_INDEX], (path, partial) => {
  // Update UI live as fields arrive
  console.log("partial@", path, partial);
});

// When an array item becomes complete, receive the final item value.
listener.onItem(["output"], (path, item) => {
  console.log("item complete@", path, item);
});

// When a specific field is fully set, receive its final value.
listener.onComplete(["meta", "request_id"], (path, value) => {
  console.log("request id:", value);
});
```

### Using with OpenAI streaming

Below are example patterns for wiring OpenAI streaming deltas into `JSONListener`. These examples assume the model is instructed to produce JSON using a JSON schema response format.

#### Live partials while streaming

Emits partial objects for each item as soon as any of its fields arrive.

```ts
import OpenAI from "openai";
import { JSONListener, ANY_INDEX } from "screaming-json";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Row = { id?: string; name?: string; value?: number | null };

export async function* streamRows(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  const listener = new JSONListener();
  const pending: { index: number; row: Row }[] = [];

  // Receive partial updates for any row under output[]
  listener.onPartial(["output", ANY_INDEX], (path, partial: Row & { _index?: number }) => {
    const index = Number((partial as any)._index);
    if (!Number.isFinite(index)) return;
    pending.push({ index, row: partial });
  });

  // Start OpenAI stream (chat.completions with streaming deltas)
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "rows",
        schema: {
          type: "object",
          properties: {
            output: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  _index: { type: "integer" },
                  id: { type: "string" },
                  name: { type: "string" },
                  value: { type: ["number", "null"] }
                },
                required: ["_index"]
              }
            }
          },
          required: ["output"]
        },
        strict: false
      }
    }
  });

  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content ?? "";
    if (delta) listener.write(delta);
    while (pending.length) yield pending.shift()!;
  }

  listener.write("", true); // terminate
  while (pending.length) yield pending.shift()!;
}
```

#### Emit completed array items

Use `onItem(["output"])` to receive each completed item in the array as soon as it finishes, regardless of its internal structure.

```ts
import OpenAI from "openai";
import { JSONListener } from "screaming-json";

export async function* streamCompletedItems(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const listener = new JSONListener();
  const queue: any[] = [];

  listener.onItem(["output"], (_path, item) => {
    queue.push(item);
  });

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    response_format: { type: "json_schema", json_schema: { name: "items", schema: {/* … */}, strict: false } }
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) listener.write(delta);
    while (queue.length) yield queue.shift();
  }

  listener.write("", true);
  while (queue.length) yield queue.shift();
}
```

#### React when a specific field completes

Use `onComplete(path)` to be notified once a given value is finalized.

```ts
import OpenAI from "openai";
import { JSONListener, ANY_INDEX } from "screaming-json";

async function waitForFirstName(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const listener = new JSONListener();

  let firstName: string | undefined;
  const done = new Promise<string>((resolve) => {
    listener.onComplete(["output", ANY_INDEX, "name"], (_path, value) => {
      if (typeof value === "string" && !firstName) {
        firstName = value;
        resolve(value);
      }
    });
  });

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    response_format: { type: "json_schema", json_schema: { name: "names", schema: {/* … */}, strict: false } }
  });

  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content ?? "";
    if (delta) listener.write(delta);
    if (firstName) break;
  }

  listener.write("", true);
  return await done;
}
```

### API

- **`JSONListener`**
  - `onPartial(path: JSONPath, cb)` — called with the current partial value whenever it changes
  - `onItem(pathToArray: JSONPath, cb)` — called when a new array element is completed
  - `onComplete(path: JSONPath, cb)` — called when a value at `path` becomes final
  - `write(chunk: string, terminate = false)` — feed streaming text; pass `terminate=true` after the final chunk

- **`ANY_INDEX`**: constant `-1` used in paths to match any array index.

`JSONPath` is an array of object keys and/or numeric indices, e.g. `["output", 0, "name"]`.
