import { StreamingJSONParser } from "./streaming-json";

export type JSONPath = (string | number)[];
export type ItemCallback = (path: JSONPath, item: any) => void;
export type PartialCallback = (path: JSONPath, partial: any) => void;
export type CompleteCallback = (path: JSONPath, value: any) => void;

export const ANY_INDEX = -1;

/**
 * Returns true if the child path (the second argument) is a covered by
 * the parent path (the first argument). Exact matches are true.
 *
 * Array wildcards (ANY_INDEX) are parents of specific items.
 *
 * Examples:
 * > isParentPath(["a"], ["a", 0]) // true
 * > isParentPath(["a"], ["a", "b"]) // true
 * > isParentPath(["a", 0], ["a", 0, "b"]) // true
 * > isParentPath(["a", 0], ["a", 1]) // false
 * > isParentPath([], []) // true
 * > isParentPath(["a"], ["a"]) // true
 * > isParentPath([-1], [0]) // true
 * > isParentPath([-1], [1]) // true
 */
function isParentPath(parent: JSONPath, child: JSONPath) {
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] === ANY_INDEX && typeof child[i] === "number") {
      // Array wildcard matches any array index.
      continue;
    }

    if (parent[i] !== child[i]) {
      return false;
    }
  }

  // All parent elements cover their corresponding child elements.
  // Empty paths trivially match everything.
  return true;
}

function isExactPath(left: JSONPath, right: JSONPath) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function queryAccumulator(
  accumulator: { path: JSONPath; partial: any },
  path: JSONPath
) {
  let value: any = accumulator.partial;
  for (let i = accumulator.path.length; i < path.length; i++) {
    if (typeof path[i] === "number" && path[i] !== ANY_INDEX) {
      // Select a specific item from an array.
      value = value[path[i]];
    } else if (typeof path[i] === "string") {
      // Select a property from an object.
      value = value[path[i]];
    } else if (path[i] === ANY_INDEX) {
      throw new Error(
        "ANY_INDEX cannot query an accumulator because it does not select a specific item."
      );
    } else {
      throw new Error("Invalid path");
    }
  }

  return value;
}

function setAtPath(
  accumulator: { path: JSONPath; partial: any },
  path: JSONPath,
  value: any
) {
  if (accumulator.path.length === path.length) {
    // Set the root of the accumulator.
    accumulator.partial = value;
    return;
  }

  let container = accumulator.partial;
  let i = accumulator.path.length;
  for (; i < path.length - 1; i++) {
    if (typeof path[i] === "number" && path[i] !== ANY_INDEX) {
      container = container[path[i]];
    } else if (typeof path[i] === "string") {
      container = container[path[i]];
    } else {
      throw new Error("Invalid path");
    }
  }

  container[path[i]] = value;
}

/**
 * Listens for JSON events yielded by the underlying streaming JSON parser.
 * Provides quality-of-life methods for handling partial JSON objects
 * and reacting to specific kinds of mutations.
 */
export class JSONListener {
  parser = new StreamingJSONParser();
  private itemListeners: { path: JSONPath; callback: ItemCallback }[] = [];
  private partialListeners: { path: JSONPath; callback: PartialCallback }[] =
    [];
  private completeListeners: { path: JSONPath; callback: CompleteCallback }[] =
    [];
  private currentPath: JSONPath = [];

  /**
   * The highest-level paths being listened to must accumulate values.
   * Paths that are children of other paths are dropped, since the parent is
   * already accumulating the values needed for the child.
   */
  private accumulators: { path: JSONPath; partial: any }[] = [];

  constructor() {}

  /**
   * Register a callback to be triggered when an item in an array is complete
   * @param path Path to the array in the JSON structure
   * @param callback Function to call with the item's path and value
   */
  onItem(path: JSONPath, callback: ItemCallback): void {
    this.itemListeners.push({ path, callback });
    this.addAccumulator(path, undefined);
  }

  /**
   * Register a callback to be triggered when partial object data is available
   * Use -1 as a wildcard to match any array index
   * @param path Path to the object in the JSON structure
   * @param callback Function to call with the partial object's path and value
   */
  onPartial(path: JSONPath, callback: PartialCallback): void {
    this.partialListeners.push({ path, callback });
    this.addAccumulator(path, undefined);
  }

  /**
   * Register a callback to be triggered when a value is completely set
   * Use -1 as a wildcard to match any array index
   * @param path Path to the value in the JSON structure
   * @param callback Function to call with the value's path and final value
   */
  onComplete(path: JSONPath, callback: CompleteCallback): void {
    this.completeListeners.push({ path, callback });
    this.addAccumulator(path, undefined);
  }

  private addAccumulator(path: JSONPath, partial: any) {
    this.accumulators.push({ path, partial });

    // TODO Remove redundant accumulators.
    // For now, maintain simple accumulators for every path being listened to.
    // This may be memory inefficient, but easier to reason about.
  }

  write(str: string, terminate = false) {
    // Implementation will be provided later
    // This is just the interface for the tests
    for (const event of this.parser.write(str, terminate)) {
      // Build up partial values for any registered accumulators.
      for (const accumulator of this.accumulators) {
        if (isParentPath(accumulator.path, event.path)) {
          switch (event.type) {
            case "open-object":
              setAtPath(accumulator, event.path, {});
              break;
            case "open-array":
              setAtPath(accumulator, event.path, []);
              break;
            case "close-boolean":
              setAtPath(accumulator, event.path, event.value);
              break;
            case "close-null":
              setAtPath(accumulator, event.path, null);
              break;
            case "set-number":
              setAtPath(accumulator, event.path, event.value);
              break;
            case "open-string":
              setAtPath(accumulator, event.path, "");
              break;
            case "append-string":
              const current = queryAccumulator(accumulator, event.path);
              setAtPath(accumulator, event.path, current + event.delta);
              break;
          }
        }
      }

      for (const partialListener of this.partialListeners) {
        if (isParentPath(partialListener.path, event.path)) {
          const accumulator = this.accumulators.find((accumulator) =>
            isParentPath(accumulator.path, event.path)
          );

          if (!accumulator) {
            throw new Error("No accumulator found for path: " + event.path);
          }

          // All events trigger a callback. The exact state of the accumulator
          const value = queryAccumulator(accumulator, partialListener.path);
          partialListener.callback(partialListener.path, value);
        }
      }

      // Trigger when new items are complete and added to an array.
      for (const itemListener of this.itemListeners) {
        // When a new item is added to an array, the last element of the path
        // is always the index of the new item. (The array has not yet closed,
        // so the current path is an index within it.)
        // However, the listener should be registered on the array itself,
        // not an index within it, since this is an event that triggers at the
        // array level, not the item level.
        if (
          typeof event.path[event.path.length - 1] === "number" &&
          isExactPath(itemListener.path, event.path.slice(0, -1))
        ) {
          // We are at a candidate index within an array to which there
          // is an item listener attached. For example,
          // listening on item ["list"] and path at ["list", 0].
          const accumulator = this.accumulators.find((accumulator) =>
            isParentPath(accumulator.path, event.path)
          );

          if (!accumulator) {
            throw new Error("No accumulator found for path: " + event.path);
          }

          switch (event.type) {
            case "close-array":
            case "close-object":
            case "close-boolean":
            case "close-null":
            case "close-number":
            case "close-string":
              const value = queryAccumulator(accumulator, event.path);
              itemListener.callback(event.path, value);
              break;
          }
        }
      }

      for (const completeListener of this.completeListeners) {
        if (isExactPath(completeListener.path, event.path)) {
          // Get an accumulator that is a parent of this path.
          const accumulator = this.accumulators.find((accumulator) =>
            isParentPath(accumulator.path, event.path)
          );

          if (!accumulator) {
            throw new Error("No accumulator found for path: " + event.path);
          }

          switch (event.type) {
            case "close-boolean":
            case "close-null":
            case "close-number":
            case "close-string":
            case "close-array":
            case "close-object":
              const value = queryAccumulator(accumulator, event.path);
              completeListener.callback(event.path, value);
              break;
          }
        }
      }
    }
  }
}
