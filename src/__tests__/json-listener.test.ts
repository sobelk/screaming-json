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
});
