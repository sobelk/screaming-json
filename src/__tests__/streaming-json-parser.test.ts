import { describe, it, expect, beforeEach } from "vitest";
import { JSONStateMachine, StreamingJSONParser } from "../streaming-json";

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
});
