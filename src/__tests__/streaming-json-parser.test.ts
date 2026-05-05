import { describe, it, expect, beforeEach } from "vitest";
import { JSONStateMachine, StreamingJSONParser } from "../state-machine";

// Need to define the event type since it's not exported
type StreamingJSONEvent =
  | { type: "open-object"; path: (string | number)[] }
  | { type: "close-object"; path: (string | number)[] }
  | { type: "open-array"; path: (string | number)[] }
  | { type: "close-array"; path: (string | number)[] }
  | { type: "open-key"; path: (string | number)[] }
  | { type: "append-key"; path: (string | number)[]; delta: string }
  | { type: "close-key"; path: (string | number)[]; key: string }
  | { type: "open-string"; path: (string | number)[] }
  | { type: "append-string"; path: (string | number)[]; delta: string }
  | { type: "close-string"; path: (string | number)[] }
  | { type: "open-number"; path: (string | number)[] }
  | { type: "set-number"; path: (string | number)[]; value: number }
  | { type: "close-number"; path: (string | number)[] }
  | { type: "open-boolean"; path: (string | number)[]; value: boolean }
  | { type: "close-boolean"; path: (string | number)[]; value: boolean }
  | { type: "open-null"; path: (string | number)[] }
  | { type: "close-null"; path: (string | number)[] };

describe("StreamingJSONParser", () => {
  let parser: StreamingJSONParser;

  beforeEach(() => {
    parser = new StreamingJSONParser();
  });

  const collectEvents = (
    input: string,
    terminate = false
  ): StreamingJSONEvent[] => {
    const events: StreamingJSONEvent[] = [];
    for (const event of parser.write(input, terminate)) {
      events.push(event as StreamingJSONEvent);
    }
    return events;
  };

  describe("basic type parsing", () => {
    it("should emit events for an empty object", () => {
      const events = collectEvents("{}");

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "open-object", path: [] });
      expect(events[1]).toEqual({ type: "close-object", path: [] });
    });

    it("should emit events for an empty array", () => {
      const events = collectEvents("[]");

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "open-array", path: [] });
      expect(events[1]).toEqual({ type: "close-array", path: [] });
    });

    it("should emit events for a simple string", () => {
      const events = collectEvents('"hello"');

      // Due to buffering, we expect 3 events: open, append, close
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0]).toEqual({ type: "open-string", path: [] });

      // Check for append-string events
      const appendEvents = events.filter((e) => e.type === "append-string");
      expect(appendEvents.length).toBeGreaterThanOrEqual(1);

      // Verify the content
      const content = appendEvents.map((e) => e.delta).join("");
      expect(content).toBe("hello");

      // Check the last event is close-string
      expect(events[events.length - 1]).toEqual({
        type: "close-string",
        path: [],
      });
    });

    it("should emit events for a number", () => {
      const events = collectEvents("123.45");

      expect(events.length).toBeGreaterThan(1);
      expect(events[0]).toEqual({ type: "open-number", path: [] });

      // Check for set-number events
      const setEvents = events.filter((e) => e.type === "set-number");
      expect(setEvents.length).toBeGreaterThan(0);
      const lastSetEvent = setEvents[setEvents.length - 1] as {
        type: string;
        path: (string | number)[];
        value: number;
      };
      expect(lastSetEvent.value).toBe(123.45);
    });

    it("should emit events for true", () => {
      const events = collectEvents("true");

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: "open-boolean",
        path: [],
        value: true,
      });
      expect(events[1]).toEqual({
        type: "close-boolean",
        path: [],
        value: true,
      });
    });

    it("should emit events for false", () => {
      const events = collectEvents("false");

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: "open-boolean",
        path: [],
        value: false,
      });
      expect(events[1]).toEqual({
        type: "close-boolean",
        path: [],
        value: false,
      });
    });

    it("should emit events for null", () => {
      const events = collectEvents("null");

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "open-null", path: [] });
      expect(events[1]).toEqual({ type: "close-null", path: [] });
    });
  });

  describe("object parsing", () => {
    it("should emit events for an object with a single string property", () => {
      const events = collectEvents('{"name":"John"}');

      // Find all event types in sequence
      const types = events.map((e) => e.type);

      expect(types).toContain("open-object");
      expect(types).toContain("open-key");
      expect(types).toContain("append-key");
      expect(types).toContain("close-key");
      expect(types).toContain("open-string");
      expect(types).toContain("append-string");
      expect(types).toContain("close-string");
      expect(types).toContain("close-object");

      // Check the key event
      const keyEvent = events.find((e) => e.type === "close-key") as {
        type: string;
        path: (string | number)[];
        key: string;
      };
      expect(keyEvent.key).toBe("name");

      // Check path progression
      const objectOpenEvent = events.find((e) => e.type === "open-object");
      expect(objectOpenEvent?.path).toEqual([]);

      const stringEvents = events.filter((e) => e.type === "append-string");
      expect(stringEvents[0].path).toContain("name");
    });

    it("should emit events for an object with multiple properties", () => {
      const events = collectEvents('{"name":"John","age":30,"active":true}');

      // Check for all three properties
      const keyEvents = events.filter((e) => e.type === "close-key") as {
        type: string;
        path: (string | number)[];
        key: string;
      }[];
      expect(keyEvents).toHaveLength(3);

      const keys = keyEvents.map((e) => e.key);
      expect(keys).toContain("name");
      expect(keys).toContain("age");
      expect(keys).toContain("active");

      // Check for value events
      const stringCloseEvent = events.find((e) => e.type === "close-string");
      expect(stringCloseEvent).toBeDefined();

      const numberEvent = events.findLast((e) => e.type === "set-number") as {
        type: string;
        path: (string | number)[];
        value: number;
      };
      expect(numberEvent.value).toBe(30);

      const booleanEvent = events.find((e) => e.type === "close-boolean") as {
        type: string;
        path: (string | number)[];
        value: boolean;
      };
      expect(booleanEvent.value).toBe(true);
    });
  });

  describe("array parsing", () => {
    it("should emit events for an array with multiple values", () => {
      const events = collectEvents('[1,"two",true]');

      // Check array open/close
      expect(events[0]).toEqual({ type: "open-array", path: [] });
      expect(events[events.length - 1]).toEqual({
        type: "close-array",
        path: [],
      });

      // Check path indices for array elements
      const numberEvent = events.find((e) => e.type === "open-number");
      expect(numberEvent?.path).toEqual([0]);

      const stringEvent = events.find((e) => e.type === "open-string");
      expect(stringEvent?.path).toEqual([1]);

      const booleanEvent = events.find((e) => e.type === "open-boolean");
      expect(booleanEvent?.path).toEqual([2]);
    });
  });

  describe("nested structure parsing", () => {
    it("should emit events for nested objects with correct paths", () => {
      // Reset parser to ensure clean state
      parser = new StreamingJSONParser();
      const events = collectEvents(
        '{"user":{"name":"John","address":{"city":"New York"}}}'
      );

      // Check paths for nested values
      const nameStringEvents = events.filter(
        (e) =>
          e.type === "append-string" &&
          e.path.length === 2 &&
          e.path[0] === "user" &&
          e.path[1] === "name"
      );
      expect(nameStringEvents.length).toBeGreaterThan(0);

      const cityStringEvents = events.filter(
        (e) =>
          e.type === "append-string" &&
          e.path.length === 3 &&
          e.path[0] === "user" &&
          e.path[1] === "address" &&
          e.path[2] === "city"
      );
      expect(cityStringEvents.length).toBeGreaterThan(0);

      // Check that all objects are properly closed
      const objectCloseEvents = events.filter((e) => e.type === "close-object");
      // We expect 3 close events: one for address, one for user object, one for root
      expect(objectCloseEvents.length).toBe(3);
    });

    it("should emit events for nested arrays with correct indices", () => {
      // Reset parser to ensure clean state
      parser = new StreamingJSONParser();
      const events = collectEvents('{"items":[[1,2],[3,4]]}');

      // Find events for nested array elements with correct type assertion
      const setNumberEvents = events.filter((e) => e.type === "set-number") as {
        type: "set-number";
        path: (string | number)[];
        value: number;
      }[];

      // Find elements by their paths
      const firstArrayFirstElement = setNumberEvents.find(
        (e) =>
          e.path.length === 3 &&
          e.path[0] === "items" &&
          e.path[1] === 0 &&
          e.path[2] === 0 &&
          e.value === 1
      );

      const secondArraySecondElement = setNumberEvents.find(
        (e) =>
          e.path.length === 3 &&
          e.path[0] === "items" &&
          e.path[1] === 1 &&
          e.path[2] === 1 &&
          e.value === 4
      );

      expect(firstArrayFirstElement).toBeDefined();
      expect(secondArraySecondElement).toBeDefined();

      // Check for correct array structure
      const arrayOpenEvents = events.filter((e) => e.type === "open-array");
      expect(arrayOpenEvents.length).toBe(3); // One for outer array, two for inner arrays

      const arrayCloseEvents = events.filter((e) => e.type === "close-array");
      expect(arrayCloseEvents.length).toBe(3);
    });
  });

  describe("streaming behavior", () => {
    it("should handle JSON split across multiple write calls", () => {
      // Reset parser for clean state
      parser = new StreamingJSONParser();

      // Write JSON in chunks
      const chunk1 = '{"us';
      const chunk2 = 'er":{"na';
      const chunk3 = 'me":"Jo';
      const chunk4 = 'hn"}}';

      // Collect events from each chunk
      const events1 = collectEvents(chunk1, false);
      const events2 = collectEvents(chunk2, false);
      const events3 = collectEvents(chunk3, false);
      const events4 = collectEvents(chunk4, true); // Terminate on last chunk

      const allEvents = [...events1, ...events2, ...events3, ...events4];

      // Check that we have the expected opening and closing events
      const openObjectEvents = allEvents.filter(
        (e) => e.type === "open-object"
      );
      expect(openObjectEvents.length).toBe(2); // One for root, one for user object

      const closeObjectEvents = allEvents.filter(
        (e) => e.type === "close-object"
      );
      expect(closeObjectEvents.length).toBe(2); // Matching closes for the two opens

      // Verify the key events
      const closeKeyEvents = allEvents.filter(
        (e) => e.type === "close-key"
      ) as {
        type: "close-key";
        path: (string | number)[];
        key: string;
      }[];

      const keys = closeKeyEvents.map((e) => e.key);
      expect(keys).toContain("user");
      expect(keys).toContain("name");

      // Check for the "John" string content in append-string events
      const nameStringEvents = allEvents.filter(
        (e) =>
          e.type === "append-string" &&
          e.path.length === 2 &&
          e.path[0] === "user" &&
          e.path[1] === "name"
      ) as {
        type: "append-string";
        path: (string | number)[];
        delta: string;
      }[];

      const content = nameStringEvents.map((e) => e.delta).join("");
      expect(content).toBe("John");
    });

    it("should handle string escapes correctly", () => {
      // Reset parser for clean state
      parser = new StreamingJSONParser();

      // Test various escape sequences
      const input = '{"escapes":"\\n\\t\\r\\b\\f\\\\\\/\\""}';
      const events = collectEvents(input);

      // Find the string content
      const stringEvents = events.filter((e) => e.type === "append-string") as {
        type: "append-string";
        path: (string | number)[];
        delta: string;
      }[];

      const content = stringEvents.map((e) => e.delta).join("");
      expect(content).toBe('\n\t\r\b\f\\/"'); // The actual escaped characters
    });

    it("should handle unicode escapes correctly", () => {
      // Reset parser for clean state
      parser = new StreamingJSONParser();

      // Test unicode escape sequences
      const input = '{"unicode":"\\u0041\\u0042\\u0043"}'; // ABC
      const events = collectEvents(input);

      // Find the string content
      const stringEvents = events.filter((e) => e.type === "append-string") as {
        type: "append-string";
        path: (string | number)[];
        delta: string;
      }[];

      const content = stringEvents.map((e) => e.delta).join("");
      expect(content).toBe("ABC");
    });

    it("should handle chunk splitting during escapes", () => {
      // Reset parser for clean state
      parser = new StreamingJSONParser();

      // Split the input across escape sequences
      const chunk1 = '{"split":"\\';
      const chunk2 = "n\\";
      const chunk3 = "t\\u00";
      const chunk4 = '41"}';

      // Collect events from each chunk
      const events1 = collectEvents(chunk1, false);
      const events2 = collectEvents(chunk2, false);
      const events3 = collectEvents(chunk3, false);
      const events4 = collectEvents(chunk4, true);

      const allEvents = [...events1, ...events2, ...events3, ...events4];

      // Find the string content
      const stringEvents = allEvents.filter(
        (e) => e.type === "append-string"
      ) as {
        type: "append-string";
        path: (string | number)[];
        delta: string;
      }[];

      const content = stringEvents.map((e) => e.delta).join("");
      expect(content).toBe("\n\tA"); // Should be \n\tA
    });

    it("should throw error when terminating on partial escape", () => {
      // Reset parser for clean state
      parser = new StreamingJSONParser();

      // Start an escape sequence but don't complete it
      const chunk1 = '{"partial":"\\';

      // This should throw when we try to terminate
      expect(() => {
        collectEvents(chunk1, true);
      }).toThrow("Premature string termination");
    });

    it("should throw error when terminating on partial unicode escape", () => {
      // Reset parser for clean state
      parser = new StreamingJSONParser();

      // Start a unicode escape sequence but don't complete it
      const chunk1 = '{"partial":"\\u00';

      // This should throw when we try to terminate
      expect(() => {
        collectEvents(chunk1, true);
      }).toThrow("Premature string termination");
    });
  });

  describe("error handling", () => {
    it("should handle invalid JSON gracefully", () => {
      // This should not throw but log errors
      expect(() => {
        collectEvents('{"invalid":');
      }).not.toThrow();
    });
  });

  describe("termination handling", () => {
    it("should emit close-number event on termination with number", () => {
      const events = collectEvents("42", true);

      // Find the close-number event
      const closeNumberEvent = events.find((e) => e.type === "close-number");
      expect(closeNumberEvent).toBeDefined();
    });
  });

  describe("number coverage", () => {
    const lastSetNumber = (events: StreamingJSONEvent[]) =>
      events.filter((e) => e.type === "set-number").pop() as
        | { type: "set-number"; path: (string | number)[]; value: number }
        | undefined;

    it("should parse zero as a root value", () => {
      const events = collectEvents("0", true);
      expect(lastSetNumber(events)?.value).toBe(0);
    });

    it("should parse negative zero as a root value", () => {
      const events = collectEvents("-0", true);
      const value = lastSetNumber(events)?.value;
      expect(Object.is(value, -0)).toBe(true);
    });

    it("should parse a negative integer as a root value", () => {
      const events = collectEvents("-5", true);
      expect(lastSetNumber(events)?.value).toBe(-5);
    });

    it("should parse a negative decimal with negative exponent", () => {
      const events = collectEvents("-1.5e-3", true);
      expect(lastSetNumber(events)?.value).toBe(-0.0015);
    });

    it("should parse zero as an object value", () => {
      const events = collectEvents('{"x":0}');
      const setNumberEvents = events.filter((e) => e.type === "set-number") as {
        type: "set-number";
        path: (string | number)[];
        value: number;
      }[];
      expect(setNumberEvents.length).toBeGreaterThan(0);
      expect(setNumberEvents[setNumberEvents.length - 1].value).toBe(0);
      expect(setNumberEvents[setNumberEvents.length - 1].path).toEqual(["x"]);
    });

    it("should parse a negative number as an object value", () => {
      const events = collectEvents('{"x":-42}');
      const setNumberEvents = events.filter((e) => e.type === "set-number") as {
        type: "set-number";
        path: (string | number)[];
        value: number;
      }[];
      expect(setNumberEvents[setNumberEvents.length - 1].value).toBe(-42);
      expect(setNumberEvents[setNumberEvents.length - 1].path).toEqual(["x"]);
    });

    it("should parse negative numbers inside an array with correct indices", () => {
      const events = collectEvents("[-1,-2,-3]");
      const setNumberEvents = events.filter((e) => e.type === "set-number") as {
        type: "set-number";
        path: (string | number)[];
        value: number;
      }[];
      // Streaming numbers emit interim set-number events while digits arrive.
      // The final set-number per index is what callers should observe.
      const lastByIndex = new Map<number, number>();
      for (const e of setNumberEvents) {
        lastByIndex.set(e.path[0] as number, e.value);
      }
      expect(lastByIndex.get(0)).toBe(-1);
      expect(lastByIndex.get(1)).toBe(-2);
      expect(lastByIndex.get(2)).toBe(-3);
    });

    it("should pin current lenient handling of leading zero", () => {
      // The state machine has a TODO for proper zero handling. Today the
      // `[-0-9]` regex accepts a leading `0` and continues collecting digits,
      // so `01` parses as 1. This test pins the current behavior; if the
      // TODO is addressed it should be updated to assert a thrown error.
      const events = collectEvents("01", true);
      expect(lastSetNumber(events)?.value).toBe(1);
    });
  });

  describe("key escapes", () => {
    it("should decode an escape sequence inside an object key", () => {
      // JSON: {"a\nb":1} — key has a literal backslash-n escape.
      const events = collectEvents('{"a\\nb":1}');
      const closeKey = events.find((e) => e.type === "close-key") as
        | { type: "close-key"; path: (string | number)[]; key: string }
        | undefined;
      expect(closeKey?.key).toBe("a\nb");
      expect(closeKey?.path).toEqual(["a\nb"]);

      // Subsequent value events should be tagged with the decoded key.
      const setNumber = events.find((e) => e.type === "set-number") as
        | { type: "set-number"; path: (string | number)[]; value: number }
        | undefined;
      expect(setNumber?.path).toEqual(["a\nb"]);
    });

    it("should decode an escaped quote inside an object key", () => {
      // JSON: {"a\"b":1}
      const events = collectEvents('{"a\\"b":1}');
      const closeKey = events.find((e) => e.type === "close-key") as
        | { type: "close-key"; path: (string | number)[]; key: string }
        | undefined;
      expect(closeKey?.key).toBe('a"b');
    });

    it("should decode a unicode escape inside an object key", () => {
      // JSON: {"é":1}  →  key is "é"
      const events = collectEvents('{"\\u00e9":1}');
      const closeKey = events.find((e) => e.type === "close-key") as
        | { type: "close-key"; path: (string | number)[]; key: string }
        | undefined;
      expect(closeKey?.key).toBe("é");
      expect(closeKey?.path).toEqual(["é"]);
    });

    it("should decode mixed escapes in a key", () => {
      // JSON: {"aA\nb":1} → key is "aA\nb"
      const events = collectEvents('{"a\\u0041\\nb":1}');
      const closeKey = events.find((e) => e.type === "close-key") as
        | { type: "close-key"; path: (string | number)[]; key: string }
        | undefined;
      expect(closeKey?.key).toBe("aA\nb");
    });

    it("should handle a key whose escape is split across chunks", () => {
      parser = new StreamingJSONParser();
      const events: StreamingJSONEvent[] = [];
      // Split inside the unicode escape: `{"\u00` | `e9":1}`
      for (const e of parser.write('{"\\u00')) events.push(e as StreamingJSONEvent);
      for (const e of parser.write('e9":1}', true)) events.push(e as StreamingJSONEvent);

      const closeKey = events.find((e) => e.type === "close-key") as
        | { type: "close-key"; path: (string | number)[]; key: string }
        | undefined;
      expect(closeKey?.key).toBe("é");
      expect(closeKey?.path).toEqual(["é"]);
    });
  });

  describe("empty strings and whitespace", () => {
    it("should emit close-string for an empty root string", () => {
      const events = collectEvents('""');
      const types = events.map((e) => e.type);
      expect(types[0]).toBe("open-string");
      expect(types[types.length - 1]).toBe("close-string");

      // Any append-string events that fire must carry an empty delta.
      const appends = events.filter((e) => e.type === "append-string") as {
        type: "append-string";
        path: (string | number)[];
        delta: string;
      }[];
      const content = appends.map((e) => e.delta).join("");
      expect(content).toBe("");
    });

    it("should parse an object whose value is the empty string", () => {
      const events = collectEvents('{"x":""}');
      const closeStringEvents = events.filter((e) => e.type === "close-string");
      expect(closeStringEvents).toHaveLength(1);
      expect(closeStringEvents[0].path).toEqual(["x"]);

      const appends = events.filter((e) => e.type === "append-string") as {
        type: "append-string";
        path: (string | number)[];
        delta: string;
      }[];
      const content = appends
        .filter((e) => e.path[0] === "x")
        .map((e) => e.delta)
        .join("");
      expect(content).toBe("");
    });

    it("should accept whitespace around colons and commas", () => {
      const events = collectEvents('{ "a" : 1 , "b" : 2 }');
      const setNumbers = events.filter((e) => e.type === "set-number") as {
        type: "set-number";
        path: (string | number)[];
        value: number;
      }[];
      const byKey = new Map<string, number>();
      for (const e of setNumbers) {
        byKey.set(e.path[0] as string, e.value);
      }
      expect(byKey.get("a")).toBe(1);
      expect(byKey.get("b")).toBe(2);
    });

    it("should accept multiline JSON with newlines and tabs", () => {
      const json = `{
\t"name": "John",
\t"items": [
\t\t1,
\t\t2
\t]
}`;
      const events = collectEvents(json);
      const closeKeys = events.filter((e) => e.type === "close-key") as {
        type: "close-key";
        path: (string | number)[];
        key: string;
      }[];
      expect(closeKeys.map((e) => e.key)).toEqual(["name", "items"]);

      const setNumbers = events.filter((e) => e.type === "set-number") as {
        type: "set-number";
        path: (string | number)[];
        value: number;
      }[];
      // Keep only the final set-number per array index (streaming may emit
      // interim values as digits arrive).
      const finalByIndex = new Map<number, number>();
      for (const e of setNumbers) {
        finalByIndex.set(e.path[1] as number, e.value);
      }
      expect(finalByIndex.get(0)).toBe(1);
      expect(finalByIndex.get(1)).toBe(2);
    });

    it("should accept leading whitespace before the root value", () => {
      const events = collectEvents('   {"x":1}');
      expect(events[0]).toEqual({ type: "open-object", path: [] });
    });

    it("should accept trailing whitespace after a closed root", () => {
      // Trailing whitespace is valid JSON. Termination should succeed.
      expect(() => collectEvents("{}   ", true)).not.toThrow();
    });
  });

  describe("streaming split edge cases", () => {
    const collectAcross = (
      chunks: { str: string; terminate?: boolean }[]
    ): StreamingJSONEvent[] => {
      parser = new StreamingJSONParser();
      const events: StreamingJSONEvent[] = [];
      for (const c of chunks) {
        for (const e of parser.write(c.str, c.terminate ?? false)) {
          events.push(e as StreamingJSONEvent);
        }
      }
      return events;
    };

    it("should resume parsing `true` across a chunk split", () => {
      const events = collectAcross([{ str: "tr" }, { str: "ue" }]);
      expect(events).toEqual([
        { type: "open-boolean", path: [], value: true },
        { type: "close-boolean", path: [], value: true },
      ]);
    });

    it("should resume parsing `false` across a chunk split", () => {
      const events = collectAcross([{ str: "fa" }, { str: "lse" }]);
      expect(events).toEqual([
        { type: "open-boolean", path: [], value: false },
        { type: "close-boolean", path: [], value: false },
      ]);
    });

    it("should resume parsing `null` across a chunk split", () => {
      const events = collectAcross([{ str: "nu" }, { str: "ll" }]);
      expect(events).toEqual([
        { type: "open-null", path: [] },
        { type: "close-null", path: [] },
      ]);
    });

    it("should accumulate digits across a chunk split", () => {
      const events = collectAcross([
        { str: "12" },
        { str: "34", terminate: true },
      ]);
      const setNumbers = events.filter((e) => e.type === "set-number") as {
        type: "set-number";
        path: (string | number)[];
        value: number;
      }[];
      // The parser may emit an interim set-number per chunk (12 then 1234);
      // the final value is what matters.
      expect(setNumbers[setNumbers.length - 1].value).toBe(1234);
    });

    it("should accept an empty write between meaningful chunks", () => {
      const events = collectAcross([
        { str: '{"x":' },
        { str: "" },
        { str: "1}" },
      ]);
      const setNumber = events.find((e) => e.type === "set-number") as
        | { type: "set-number"; path: (string | number)[]; value: number }
        | undefined;
      expect(setNumber?.value).toBe(1);
      expect(setNumber?.path).toEqual(["x"]);
    });
  });

  describe("post-root data", () => {
    it("should throw on a second value after a closed root", () => {
      // `{}{}` — a second value follows a complete root with no separator.
      // The state machine has no concept of multiple top-level values.
      expect(() => collectEvents("{}{}", true)).toThrow();
    });

    it("should throw on garbage after a closed root", () => {
      expect(() => collectEvents("{}garbage", true)).toThrow();
    });
  });

  describe("spec edge cases", () => {
    it("should decode a surrogate-pair unicode escape", () => {
      // 😀 → 😀 (U+1F600)
      const events = collectEvents('"\\uD83D\\uDE00"');
      const appends = events.filter((e) => e.type === "append-string") as {
        type: "append-string";
        path: (string | number)[];
        delta: string;
      }[];
      const content = appends.map((e) => e.delta).join("");
      expect(content).toBe("😀");
    });

    it("should reject a bare minus sign as a number", () => {
      // Per JSON spec, `-` MUST be followed by a digit. Without one the
      // parser should refuse to terminate.
      expect(() => collectEvents("-", true)).toThrow();
    });

    it("should reject a number with a trailing decimal point", () => {
      expect(() => collectEvents("5.", true)).toThrow();
    });

    it("should reject a number with no leading digit", () => {
      expect(() => collectEvents(".5", true)).toThrow();
    });

    it("should reject a leading positive sign on a number", () => {
      expect(() => collectEvents("+5", true)).toThrow();
    });

    it("should parse an empty string as an object key", () => {
      const events = collectEvents('{"":1}');
      const closeKey = events.find((e) => e.type === "close-key") as
        | { type: "close-key"; path: (string | number)[]; key: string }
        | undefined;
      expect(closeKey?.key).toBe("");
      expect(closeKey?.path).toEqual([""]);

      const setNumber = events.find((e) => e.type === "set-number") as
        | { type: "set-number"; path: (string | number)[]; value: number }
        | undefined;
      expect(setNumber?.path).toEqual([""]);
      expect(setNumber?.value).toBe(1);
    });

    it("should treat a numeric-looking key as a string", () => {
      // The JSON object key "123" must stay a string in the path; arrays
      // use numeric indices.
      const events = collectEvents('{"123":"value"}');
      const closeKey = events.find((e) => e.type === "close-key") as
        | { type: "close-key"; path: (string | number)[]; key: string }
        | undefined;
      expect(closeKey?.key).toBe("123");
      expect(typeof closeKey?.path[0]).toBe("string");
    });

    it("should accept whitespace inside an empty object", () => {
      expect(() => collectEvents("{ }", true)).not.toThrow();
    });

    it("should accept whitespace inside an empty array", () => {
      expect(() => collectEvents("[ ]", true)).not.toThrow();
    });

    it("should handle consecutive `]]` closing nested arrays", () => {
      const events = collectEvents("[[1,2]]");
      const closeArrays = events.filter((e) => e.type === "close-array");
      expect(closeArrays).toHaveLength(2);
      expect(closeArrays[0].path).toEqual([0]);
      expect(closeArrays[1].path).toEqual([]);
    });

    it("should handle `]}` closing an array inside an object", () => {
      const events = collectEvents('{"xs":[1,2]}');
      const closeArray = events.find((e) => e.type === "close-array");
      const closeObject = events.find((e) => e.type === "close-object");
      expect(closeArray?.path).toEqual(["xs"]);
      expect(closeObject?.path).toEqual([]);
    });

    it("should handle `}]` closing an object inside an array", () => {
      const events = collectEvents('[{"x":1}]');
      const closeObject = events.find((e) => e.type === "close-object");
      const closeArray = events.find((e) => e.type === "close-array");
      expect(closeObject?.path).toEqual([0]);
      expect(closeArray?.path).toEqual([]);
    });

    it("should reject writes after termination", () => {
      parser = new StreamingJSONParser();
      for (const _ of parser.write("{}", true)) {
        // drain
      }
      expect(() => {
        for (const _ of parser.write("x")) {
          // drain
        }
      }).toThrow(/after termination/);
    });
  });
});
