import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  JSONListener,
  JSONPath,
  ItemCallback,
  CompleteCallback,
} from "../json-listener";

describe("JSONListener", () => {
  let listener: JSONListener;

  beforeEach(() => {
    listener = new JSONListener();
  });

  describe("onItem", () => {
    it("should trigger when an array item is complete", () => {
      const callback = vi.fn();
      listener.onItem(["elements"], callback);

      listener.write('{"elements":[{"name":"Rabbit","weight":3}]}');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["elements", 0], {
        name: "Rabbit",
        weight: 3,
      });
    });

    it("should trigger for each array item", () => {
      const callback = vi.fn();
      listener.onItem(["elements"], callback);

      listener.write(
        '{"elements":[{"name":"Rabbit","weight":3},{"name":"Cat","weight":6}]}'
      );

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(["elements", 0], {
        name: "Rabbit",
        weight: 3,
      });
      expect(callback).toHaveBeenCalledWith(["elements", 1], {
        name: "Cat",
        weight: 6,
      });
    });

    it("should trigger for nested arrays", () => {
      const callback = vi.fn();
      listener.onItem(["data", "animals"], callback);

      listener.write('{"data":{"animals":[{"name":"Rabbit"},{"name":"Cat"}]}}');

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(["data", "animals", 0], {
        name: "Rabbit",
      });
      expect(callback).toHaveBeenCalledWith(["data", "animals", 1], {
        name: "Cat",
      });
    });

    it("should work with streaming input", () => {
      const callback = vi.fn();
      listener.onItem(["elements"], callback);

      listener.write('{"elements":[');
      listener.write('{"name":"Rabbit","weight":3}');
      listener.write(",");
      listener.write('{"name":"Cat","weight":6}');
      listener.write("]}");

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(["elements", 0], {
        name: "Rabbit",
        weight: 3,
      });
      expect(callback).toHaveBeenCalledWith(["elements", 1], {
        name: "Cat",
        weight: 6,
      });
    });

    it("should trigger with whitespace between object members", () => {
      const callback = vi.fn();
      listener.onItem(["expenses"], callback);

      listener.write(
        '{"expenses": [{"_index": 0, "occurredAt": "2026-04-04", "description": "Spoonbill & Sugartown Books, Inc. - Book purchase", "category": "supplies", "amountCents": 3266}]}'
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["expenses", 0], {
        _index: 0,
        occurredAt: "2026-04-04",
        description:
          "Spoonbill & Sugartown Books, Inc. - Book purchase",
        category: "supplies",
        amountCents: 3266,
      });
    });

    it("should trigger with whitespace between array items", () => {
      const callback = vi.fn();
      listener.onItem(["elements"], callback);

      listener.write('{"elements":[{"name":"Rabbit"}, {"name":"Cat"}]}');

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, ["elements", 0], {
        name: "Rabbit",
      });
      expect(callback).toHaveBeenNthCalledWith(2, ["elements", 1], {
        name: "Cat",
      });
    });
  });

  describe("onPartial", () => {
    it("should trigger with partial object data", () => {
      const callback = vi.fn();
      listener.onPartial(["user"], callback);

      // Write object in chunks
      listener.write('{"user":{"name":"Jo');

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(["user"], { name: "Jo" });

      listener.write('hn","age":3');

      expect(callback).toHaveBeenCalledWith(["user"], { name: "John", age: 3 });
    });

    it("should support wildcards for array elements with -1", () => {
      const callback = vi.fn();
      listener.onPartial(["elements", -1], callback);

      listener.write('{"elements":[{"name":"Ra');

      expect(callback).toHaveBeenCalledWith(["elements", 0], { name: "Ra" });

      listener.write('bbit","weight":3},{"name":"C');

      expect(callback).toHaveBeenCalledWith(["elements", 0], {
        name: "Rabbit",
        weight: 3,
      });

      expect(callback).toHaveBeenCalledWith(["elements", 1], { name: "C" });
    });

    it("should work with nested objects and arrays", () => {
      const callback = vi.fn();
      listener.onPartial(["data", "animals", -1, "stats"], callback);

      listener.write('{"data":{"animals":[{"name":"Rabbit","stats":{"weight":');

      expect(callback).toHaveBeenCalledWith(["data", "animals", 0, "stats"], {
        weight: undefined,
      });

      listener.write('3,"height":10}}]}}');

      expect(callback).toHaveBeenCalledWith(["data", "animals", 0, "stats"], {
        weight: 3,
        height: 10,
      });
    });
  });

  describe("onComplete", () => {
    it("should trigger when a nested string is complete", () => {
      const callback = vi.fn();
      listener.onComplete(["user", "name"], callback);

      listener.write('{"user":{"name":"John","age":30}}');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["user", "name"], "John");
    });

    it("should trigger when a root complex object is complete", () => {
      const callback = vi.fn();
      listener.onComplete([], callback);

      listener.write('{"user":{"name":"John","age":30}}');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([], {
        user: {
          name: "John",
          age: 30,
        },
      });
    });

    it("should work with the -1 wildcard for array elements", () => {
      const callback = vi.fn();
      listener.onComplete(["elements", -1, "weight"], callback);

      listener.write(
        '{"elements":[{"name":"Rabbit","weight":3},{"name":"Cat","weight":6}]}'
      );

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(["elements", 0, "weight"], 3);
      expect(callback).toHaveBeenCalledWith(["elements", 1, "weight"], 6);
    });

    it("should trigger when a complex value is fully set", () => {
      const callback = vi.fn();
      listener.onComplete(["user", "address"], callback);

      listener.write(
        '{"user":{"name":"John","address":{"city":"New York","zip":10001}}}'
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["user", "address"], {
        city: "New York",
        zip: 10001,
      });
    });

    it("should accumulate totals using callbacks", () => {
      let totalWeight = 0;

      const weightCallback: CompleteCallback = (
        path: JSONPath,
        weight: number
      ) => {
        totalWeight += weight;
      };

      listener.onComplete(["elements", -1, "weight"], weightCallback);

      listener.write(
        '{"elements":[{"name":"Rabbit","weight":3},{"name":"Cat","weight":6}]}'
      );

      expect(totalWeight).toBe(9);
    });

    it("should work with streaming input", () => {
      const callback = vi.fn();
      listener.onComplete(["elements", -1, "name"], callback);

      listener.write('{"elements":[');
      listener.write('{"name":"Rabbit"');
      listener.write(',"weight":3}');
      listener.write(",");
      listener.write('{"name":"Cat","weight":6}');
      listener.write("]}");

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(["elements", 0, "name"], "Rabbit");
      expect(callback).toHaveBeenCalledWith(["elements", 1, "name"], "Cat");
    });
  });

  describe("multiple listeners", () => {
    it("should support multiple listeners of different types", () => {
      const itemCallback = vi.fn();
      const partialCallback = vi.fn();
      const completeCallback = vi.fn();

      listener.onItem(["elements"], itemCallback);
      listener.onPartial(["elements", -1], partialCallback);
      listener.onComplete(["elements", -1, "weight"], completeCallback);

      listener.write('{"elements":[{"name":"Ra');
      listener.write('bbit","weight":3},{"name":"Cat","weight":6}]}');

      // Check item callback was called for both complete items
      expect(itemCallback).toHaveBeenCalledTimes(2);

      // Check partial callback was called multiple times
      expect(partialCallback).toHaveBeenCalled();

      // Check complete callback was called for both weight fields
      expect(completeCallback).toHaveBeenCalledTimes(2);
      expect(completeCallback).toHaveBeenCalledWith(
        ["elements", 0, "weight"],
        3
      );
      expect(completeCallback).toHaveBeenCalledWith(
        ["elements", 1, "weight"],
        6
      );
    });
  });

  describe("memory efficiency", () => {
    it("should only keep track of paths that are being listened to", () => {
      // This test needs the implementation to verify
      // But we can set up the listeners to ensure the behavior
      const callback = vi.fn();

      listener.onComplete(["specific", "path", "to", "value"], callback);

      // Process a large JSON with many unrelated paths
      const json = `{
        "unrelated": {
          "data": [1, 2, 3, 4, 5],
          "moreData": { "a": 1, "b": 2 }
        },
        "specific": {
          "path": {
            "to": {
              "value": "important"
            }
          }
        }
      }`;

      listener.write(json);

      expect(callback).toHaveBeenCalledWith(
        ["specific", "path", "to", "value"],
        "important"
      );

      // The actual memory efficiency would need to be verified in implementation
    });
  });

  describe("path matching discrimination", () => {
    it("should not match a numeric listener segment against a string key", () => {
      // The listener path declares a number `0` at index 0, but the JSON
      // exposes a string key "0". These should be distinct.
      const callback = vi.fn();
      listener.onComplete([0, "name"], callback);

      listener.write('{"0":{"name":"value"}}');

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not match a string listener segment against an array index", () => {
      const callback = vi.fn();
      // Listener wants ["a","b"] but the structure under "a" is an array,
      // so the parser emits paths like ["a", 0] — string "b" must not match
      // numeric 0.
      listener.onComplete(["a", "b"], callback);

      listener.write('{"a":["x","y"]}');

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not fire the wildcard listener on object keys", () => {
      // ANY_INDEX is an array wildcard — it should never resolve to a
      // string key.
      const callback = vi.fn();
      listener.onComplete([-1], callback);

      listener.write('{"a":1,"b":2}');

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not fire ['items', -1] when items is an object", () => {
      const callback = vi.fn();
      listener.onComplete(["items", -1], callback);

      listener.write('{"items":{"a":1,"b":2}}');

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not fire onItem for sibling arrays at the wrong path", () => {
      const callback = vi.fn();
      listener.onItem(["users"], callback);

      listener.write('{"posts":[{"id":1},{"id":2}]}');

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not fire onPartial for events outside the registered subtree", () => {
      const callback = vi.fn();
      listener.onPartial(["users"], callback);

      listener.write('{"posts":[1,2,3],"meta":{"k":"v"}}');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("onComplete on primitive values", () => {
    it("should fire with a numeric value at a nested path", () => {
      const callback = vi.fn();
      listener.onComplete(["x"], callback);

      listener.write('{"x":-42}');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["x"], -42);
    });

    it("should fire with zero", () => {
      const callback = vi.fn();
      listener.onComplete(["x"], callback);

      listener.write('{"x":0}');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["x"], 0);
    });
  });

  describe("onItem with primitive arrays", () => {
    it("should fire for each numeric element", () => {
      const callback = vi.fn();
      listener.onItem(["nums"], callback);

      listener.write('{"nums":[1,2,3]}');

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, ["nums", 0], 1);
      expect(callback).toHaveBeenNthCalledWith(2, ["nums", 1], 2);
      expect(callback).toHaveBeenNthCalledWith(3, ["nums", 2], 3);
    });

    it("should fire for each string element", () => {
      const callback = vi.fn();
      listener.onItem(["tags"], callback);

      listener.write('{"tags":["a","b","c"]}');

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, ["tags", 0], "a");
      expect(callback).toHaveBeenNthCalledWith(2, ["tags", 1], "b");
      expect(callback).toHaveBeenNthCalledWith(3, ["tags", 2], "c");
    });

    it("should fire for booleans and null", () => {
      const callback = vi.fn();
      listener.onItem(["flags"], callback);

      listener.write('{"flags":[true,false,null]}');

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, ["flags", 0], true);
      expect(callback).toHaveBeenNthCalledWith(2, ["flags", 1], false);
      expect(callback).toHaveBeenNthCalledWith(3, ["flags", 2], null);
    });
  });

  describe("onComplete on empty containers", () => {
    it("should fire with an empty object value", () => {
      const callback = vi.fn();
      listener.onComplete(["x"], callback);

      listener.write('{"x":{}}');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["x"], {});
    });

    it("should fire with an empty array value", () => {
      const callback = vi.fn();
      listener.onComplete(["x"], callback);

      listener.write('{"x":[]}');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(["x"], []);
    });

    it("should fire on the root for an empty object", () => {
      const callback = vi.fn();
      listener.onComplete([], callback);

      listener.write("{}");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([], {});
    });

    it("should fire on the root for an empty array", () => {
      const callback = vi.fn();
      listener.onComplete([], callback);

      listener.write("[]");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([], []);
    });
  });

  describe("onPartial against a primitive value", () => {
    it("should report incremental string growth at the registered path", () => {
      const callback = vi.fn();
      listener.onPartial(["msg"], callback);

      listener.write('{"msg":"hel');
      expect(callback).toHaveBeenCalledWith(["msg"], "hel");

      listener.write('lo"}');
      expect(callback).toHaveBeenCalledWith(["msg"], "hello");
    });

    it("should report the final number value at the registered path", () => {
      const callback = vi.fn();
      listener.onPartial(["score"], callback);

      listener.write('{"score":42}');

      expect(callback).toHaveBeenCalledWith(["score"], 42);
    });
  });

  describe("listener stress", () => {
    it("should support multiple wildcards in a single path", () => {
      const callback = vi.fn();
      listener.onComplete(["users", -1, "items", -1, "name"], callback);

      listener.write(
        '{"users":[' +
          '{"items":[{"name":"a"},{"name":"b"}]},' +
          '{"items":[{"name":"c"}]}' +
          "]}"
      );

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenCalledWith(
        ["users", 0, "items", 0, "name"],
        "a"
      );
      expect(callback).toHaveBeenCalledWith(
        ["users", 0, "items", 1, "name"],
        "b"
      );
      expect(callback).toHaveBeenCalledWith(
        ["users", 1, "items", 0, "name"],
        "c"
      );
    });

    it("should fire each callback when the same path is registered twice", () => {
      const callbackA = vi.fn();
      const callbackB = vi.fn();
      listener.onComplete(["x"], callbackA);
      listener.onComplete(["x"], callbackB);

      listener.write('{"x":42}');

      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
      expect(callbackA).toHaveBeenCalledWith(["x"], 42);
      expect(callbackB).toHaveBeenCalledWith(["x"], 42);
    });

    it("should fire onComplete on a root primitive number", () => {
      const callback = vi.fn();
      listener.onComplete([], callback);

      listener.write("42", true);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([], 42);
    });

    it("should fire onComplete on a root primitive string", () => {
      const callback = vi.fn();
      listener.onComplete([], callback);

      listener.write('"hello"');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([], "hello");
    });

    it("should fire onItem at the root for a top-level array", () => {
      const callback = vi.fn();
      listener.onItem([], callback);

      listener.write("[10,20,30]");

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, [0], 10);
      expect(callback).toHaveBeenNthCalledWith(2, [1], 20);
      expect(callback).toHaveBeenNthCalledWith(3, [2], 30);
    });

    it("should fire onPartial at the root as the JSON grows", () => {
      const callback = vi.fn();
      listener.onPartial([], callback);

      listener.write('{"x":1');
      // After this chunk we should have observed an intermediate state
      // containing x=1.
      expect(callback).toHaveBeenCalledWith([], { x: 1 });

      listener.write(',"y":2}');
      expect(callback).toHaveBeenCalledWith([], { x: 1, y: 2 });
    });
  });
});
