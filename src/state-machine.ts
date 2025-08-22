const ESCAPE_MAP: Record<string, string> = {
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  "/": "/",
  '"': '"',
  "\\": "\\",
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [x: string]: JsonValue }
  | JsonValue[];

type JSONState =
  | "open"
  | "value-close"
  | "array-open"
  | "array-comma"
  | "array-close"
  | "object-open"
  | "object-member-separator"
  | "object-comma"
  | "object-close"
  | "string-open"
  | "string-char"
  | "string-close"
  | "string-escape"
  | "string-escaped-char"
  | "string-escape-unicode-open"
  | "string-escape-unicode-2"
  | "string-escape-unicode-3"
  | "string-escape-unicode-4"
  | "string-escape-unicode-close"
  | "key-close"
  | "number-sign"
  | "number-integer"
  | "number-integer-zero"
  | "number-decimal"
  | "number-decimal-digit"
  | "number-exponent"
  | "number-exponent-sign"
  | "number-exponent-digit"
  | "number-close" // Whitespace that terminates a number.
  | "true-open"
  | "true-2"
  | "true-3"
  | "true-close"
  | "false-open"
  | "false-2"
  | "false-3"
  | "false-4"
  | "false-close"
  | "null-open"
  | "null-2"
  | "null-3"
  | "null-close"
  | "end";

export class JSONStateMachine {
  private state: JSONState = "open";
  private containerStack: ("array" | "object")[] = [];
  public index = -1;
  public isInKey = false;
  public isTerminated = false;

  constructor() {}

  terminate() {
    this.isTerminated = true;
    if (
      (this.state === "number-integer" ||
        this.state === "number-decimal-digit" ||
        this.state === "number-exponent-digit" ||
        this.state === "object-close" ||
        this.state === "array-close" ||
        this.state === "string-close" ||
        this.state === "true-close" ||
        this.state === "false-close" ||
        this.state === "null-close") &&
      this.containerStack.length === 0
    ) {
      // These states support closure, so long as there are no open containers.
      return "end";
    }

    throw new Error(
      `Premature string termination in state ${this.state} after index ${this.index}`
    );
  }

  writeCharacter(char: string): JSONState {
    this.state = this.stepState(char);
    return this.state;
  }

  stepState(char: string): JSONState {
    const currentContainer =
      this.containerStack[this.containerStack.length - 1];
    this.index++;

    if (this.isTerminated) {
      throw new Error(`Cannot write character ${char} after termination`);
    }

    switch (this.state) {
      case "array-open":
        if (char === "]") {
          // An array may be immediately closed or it may fall through to the
          // next case statement and take a value.
          this.containerStack.pop();
          return "array-close";
        }

      // These are all the states that can accept any new value and must
      // be followed by a value.
      case "open":
      case "array-comma":
      case "object-member-separator":
        if (char.match(/\s/)) {
          return this.state;
        }

        if (char === "{") {
          // A new object is opening.
          this.containerStack.push("object");
          return "object-open";
        }

        if (char === "[") {
          // A new array is opening.
          this.containerStack.push("array");
          return "array-open";
        }

        if (char === '"') {
          // A new string is opening.
          return "string-open";
        }

        if (char === "t") {
          // A new boolean is opening.
          return "true-open";
        }

        if (char === "f") {
          // A new boolean is opening.
          return "false-open";
        }

        if (char === "n") {
          // A new null is opening.
          return "null-open";
        }

        if (char.match(/[-0-9]/)) {
          // A new number is opening.
          return "number-integer";
        }

        if (char === "0") {
          // TODO Handle zero properly. For now, treat it as a valid number when
          // finding a leading zero.
          // Zero may start a number, but it cannot be followed by a digit.
          return "number-integer-zero";
        }

        break;

      case "object-open":
        // New object. Accepts a key or closing brace.
        if (char.match(/\s/)) {
          return this.state;
        }

        if (char === "}") {
          // Object is immediately closed.
          return "object-close";
        }

        if (char === '"') {
          this.isInKey = true;
          return "string-open";
        }
        break;

      case "key-close":
        // Keys must be followed by a colon.
        if (char.match(/\s/)) {
          return this.state;
        }

        if (char === ":") {
          return "object-member-separator";
        }
        break;

      case "object-comma":
        // Only a new key can follow a comma in an object.
        if (char.match(/\s/)) {
          return this.state;
        }

        if (char === '"') {
          this.isInKey = true;
          return "string-open";
        }
        break;

      case "string-open":
      case "string-char":
      case "string-escaped-char":
      case "string-escape-unicode-close":
        if (char === '"') {
          // A string closed.
          if (this.isInKey) {
            // This is a special state that requires a ':' to follow.
            this.isInKey = false;
            return "key-close";
          } else {
            return "string-close";
          }
        }

        if (char === "\\") {
          // An escape character is opening.
          return "string-escape";
        }

        // Any other character is acceptable here.
        return "string-char";

      case "string-escape":
        if (ESCAPE_MAP[char]) {
          // This is a valid single-character escape. Continue parsing the string.
          return "string-escaped-char";
        }

        if (char === "u") {
          // An escaped unicode character is opening.
          return "string-escape-unicode-open";
        }
        break;

      case "string-escape-unicode-open":
        // We've seen \u, so we need 4 hex digits.
        if (char.match(/[0-9a-fA-F]/)) {
          // A unicode character is opening.
          return "string-escape-unicode-2";
        }
        break;

      case "string-escape-unicode-2":
        if (char.match(/[0-9a-fA-F]/)) {
          return "string-escape-unicode-3";
        }
        break;

      case "string-escape-unicode-3":
        if (char.match(/[0-9a-fA-F]/)) {
          return "string-escape-unicode-4";
        }
        break;

      case "string-escape-unicode-4":
        if (char.match(/[0-9a-fA-F]/)) {
          // The end of the unicode escape sequence is reached.
          return "string-escape-unicode-close";
        }
        break;

      case "false-open":
        if (char === "a") {
          return "false-2";
        }
        break;
      case "false-2":
        if (char === "l") {
          return "false-3";
        }
        break;
      case "false-3":
        if (char === "s") {
          return "false-4";
        }
        break;
      case "false-4":
        if (char === "e") {
          return "false-close";
        }
        break;
      case "true-open":
        if (char === "r") {
          return "true-2";
        }
        break;
      case "true-2":
        if (char === "u") {
          return "true-3";
        }
        break;
      case "true-3":
        if (char === "e") {
          return "true-close";
        }
        break;
      case "null-open":
        if (char === "u") {
          return "null-2";
        }
        break;
      case "null-2":
        if (char === "l") {
          return "null-3";
        }
        break;
      case "null-3":
        if (char === "l") {
          return "null-close";
        }
        break;

      case "number-integer":
        // This is the first part of the number. The digits may continue
        // or there may be a decimal point or exponent.
        if (char.match(/\d/)) {
          // The number may continue.
          return "number-integer";
        }

        if (char === ".") {
          return "number-decimal";
        }

        if (char === "e" || char === "E") {
          return "number-exponent";
        }
        break;

      case "number-decimal":
        // We are after the decimal point. At least one digit must follow.
        if (char.match(/\d/)) {
          return "number-decimal-digit";
        }
        break;

      case "number-decimal-digit":
        // We are after the decimal point. A digit or exponent must follow.
        if (char.match(/\d/)) {
          return "number-decimal-digit";
        }

        if (char === "e" || char === "E") {
          return "number-exponent";
        }
        break;

      case "number-exponent":
        // We are starting an exponent. A sign or digits must follow.
        if (char === "+" || char === "-") {
          return "number-exponent-sign";
        }

        if (char.match(/[0-9]/)) {
          return "number-exponent-digit";
        }
        break;

      case "number-exponent-sign":
        // We are after the exponent sign. At least one digit must follow.
        if (char.match(/[0-9]/)) {
          return "number-exponent-digit";
        }
        break;

      case "number-exponent-digit":
        // We are in an exponent. Only digits continue the number.
        if (char.match(/[0-9]/)) {
          return "number-exponent-digit";
        }
    }

    // If here, then a value is complete or, in the case of a number, may
    // be completed.
    switch (this.state) {
      case "number-integer":
      case "number-decimal-digit":
      case "number-exponent-digit":
      case "object-close":
      case "array-close":
      case "string-close":
      case "true-close":
      case "false-close":
      case "null-close":
      case "value-close":
        if (char.match(/\s/)) {
          return "value-close";
        }

        if (currentContainer === "array") {
          if (char === "]") {
            // An array closed.
            this.containerStack.pop();
            return "array-close";
          }

          if (char === ",") {
            // An array is expecting a value.
            return "array-comma";
          }
        }

        if (currentContainer === "object") {
          if (char === "}") {
            // An object closed.
            this.containerStack.pop();
            return "object-close";
          }

          if (char === ",") {
            // An object is expecting a key.
            return "object-comma";
          }
        }
        break;
    }

    debugger;
    throw new Error(`Invalid character at index ${this.index}: ${char}`);
  }
}

type StreamingJSONEvent =
  | {
      type: "open-object";
      path: (string | number)[];
    }
  | {
      type: "close-object";
      path: (string | number)[];
    }
  | {
      type: "open-array";
      path: (string | number)[];
    }
  | {
      type: "close-array";
      path: (string | number)[];
    }
  | {
      type: "open-key";
      path: (string | number)[];
    }
  | {
      type: "append-key";
      path: (string | number)[];
      delta: string;
    }
  | {
      type: "close-key";
      path: (string | number)[];
      key: string;
    }
  | {
      type: "open-string";
      path: (string | number)[];
    }
  | {
      type: "append-string";
      path: (string | number)[];
      delta: string;
    }
  | {
      type: "close-string";
      path: (string | number)[];
    }
  | {
      type: "open-number";
      path: (string | number)[];
    }
  | {
      type: "set-number";
      path: (string | number)[];
      value: number;
    }
  | {
      type: "close-number";
      path: (string | number)[];
    }
  | {
      type: "open-boolean";
      path: (string | number)[];
      value: boolean;
    }
  | {
      type: "close-boolean";
      path: (string | number)[];
      value: boolean;
    }
  | {
      type: "open-null";
      path: (string | number)[];
    }
  | {
      type: "close-null";
      path: (string | number)[];
    };

export class StreamingJSONParser {
  stateMachine = new JSONStateMachine();
  state: JSONState = "open";
  path: (string | number)[] = [];
  numberBuffer = "";
  stringBuffer = "";
  unicodeBuffer = "";
  currentKey = "";
  currentIndex = 0;

  *write(str: string, terminate = false) {
    for (const event of this._write(str, terminate)) {
      yield event;
    }
  }

  *_write(str: string, terminate = false): Generator<StreamingJSONEvent> {
    for (const char of str) {
      let previousState = this.state;
      this.state = this.stateMachine.writeCharacter(char);

      // Certain state changes can continue a number, but most state changes
      // after a number signify its completion.
      if (
        this.numberBuffer &&
        this.state !== "number-integer" &&
        this.state !== "number-decimal" &&
        this.state !== "number-exponent" &&
        this.state !== "number-exponent-sign" &&
        this.state !== "number-exponent-digit" &&
        this.state !== "number-decimal-digit"
      ) {
        yield {
          type: "set-number",
          path: [...this.path],
          value: Number(this.numberBuffer),
        };
        yield { type: "close-number", path: [...this.path] };
        this.numberBuffer = "";
      }

      switch (this.state) {
        case "open":
          // The initial state or whitespace following it.
          break;

        case "object-open":
          // For consistency with other open events, do not include a
          // new key.
          yield { type: "open-object", path: [...this.path] };
          break;

        case "object-comma":
          this.path.pop();
          break;

        case "object-close":
          this.path.pop();
          yield { type: "close-object", path: [...this.path] };
          break;

        case "array-open":
          yield { type: "open-array", path: [...this.path] };
          this.path.push(0);
          break;

        case "array-comma":
          (this.path[this.path.length - 1] as number)++;
          break;

        case "array-close":
          this.path.pop();
          yield { type: "close-array", path: [...this.path] };
          break;

        case "string-open":
          if (this.stateMachine.isInKey) {
            yield { type: "open-key", path: [...this.path] };
          } else {
            yield { type: "open-string", path: [...this.path] };
          }
          break;

        case "string-char":
          // Do not yield immediately. Wait until a state transition or
          // the end of a chunk.
          this.stringBuffer += char;
          if (this.stateMachine.isInKey) {
            this.currentKey += char;
          }
          break;

        case "string-escape":
          // Wait until the next character to add it to the buffer. Do not
          // yield any invalid strings.
          break;

        case "string-escaped-char":
          this.stringBuffer += ESCAPE_MAP[char];
          break;

        case "string-escape-unicode-open":
          // This is the 'u' character.
          break;
        case "string-escape-unicode-2":
        case "string-escape-unicode-3":
        case "string-escape-unicode-4":
          // Buffer the Unicode code point until it is complete.
          this.unicodeBuffer += char;
          break;
        case "string-escape-unicode-close":
          this.unicodeBuffer += char;
          this.stringBuffer += String.fromCodePoint(
            parseInt(this.unicodeBuffer, 16)
          );
          this.unicodeBuffer = "";
          break;

        case "key-close":
          // Yield one event for a batch of characters.
          yield {
            type: "append-key",
            path: [...this.path],
            delta: this.stringBuffer,
          };
          this.path.push(this.currentKey);
          yield {
            type: "close-key",
            path: [...this.path],
            key: this.currentKey,
          };
          this.stringBuffer = "";
          this.currentKey = "";
          break;

        case "string-close":
          yield {
            type: "append-string",
            path: [...this.path],
            delta: this.stringBuffer,
          };
          yield { type: "close-string", path: [...this.path] };
          this.stringBuffer = "";
          break;

        case "number-sign":
          // Can only be the first character of a number.
          this.numberBuffer += char;
          yield { type: "open-number", path: [...this.path] };
          break;

        case "number-integer":
          // May the first character of a number or a middle character.
          if (!this.numberBuffer) {
            yield { type: "open-number", path: [...this.path] };
          }

          // Like strings, only yield numbers at the end of a chunk or
          // when the number is complete.
          this.numberBuffer += char;
          break;

        case "number-decimal":
        case "number-exponent":
        case "number-exponent-sign":
          // These can neither start nor end a number, nor alter the value
          // of the number.
          this.numberBuffer += char;
          break;

        case "number-exponent-digit":
        case "number-decimal-digit":
          // These leave the number in a valid state.
          this.numberBuffer += char;
          break;

        case "false-open":
          yield {
            type: "open-boolean",
            path: [...this.path],
            value: false,
          };
          break;
        case "false-2":
        case "false-3":
        case "false-4":
          break;
        case "false-close":
          yield {
            type: "close-boolean",
            path: [...this.path],
            value: false,
          };
          break;

        case "true-open":
          yield {
            type: "open-boolean",
            path: [...this.path],
            value: true,
          };
          break;
        case "true-2":
        case "true-3":
          break;
        case "true-close":
          yield {
            type: "close-boolean",
            path: [...this.path],
            value: true,
          };
          break;

        case "null-open":
          yield { type: "open-null", path: [...this.path] };
          break;
        case "null-2":
        case "null-3":
          break;
        case "null-close":
          yield { type: "close-null", path: [...this.path] };
          break;
      }
    }

    // Yield any string or key deltas at the end of any one chunk.
    if (this.stringBuffer) {
      if (this.stateMachine.isInKey) {
        // Note that the currentKey buffer is not cleared. It is persistent
        // across chunks because we need to remember the full key in order
        // to maintain the correct path. The string buffer, on the other hand,
        // is only needed for the current chunk.
        yield {
          type: "append-key",
          path: [...this.path],
          delta: this.stringBuffer,
        };
      } else {
        yield {
          type: "append-string",
          path: [...this.path],
          delta: this.stringBuffer,
        };
      }
      this.stringBuffer = "";
    }

    // Yield numbers in progress at the end of a chunk. If it is the last chunk,
    // then close the number.
    if (this.numberBuffer) {
      if (
        this.state === "number-integer" ||
        this.state === "number-decimal-digit" ||
        this.state === "number-exponent-digit"
      ) {
        yield {
          type: "set-number",
          path: [...this.path],
          value: Number(this.numberBuffer),
        };
      }

      if (terminate) {
        // Numbers have the quirk that they do not have a definite close character.
        yield { type: "close-number", path: [...this.path] };
      }
    }

    if (terminate) {
      // Do not accept more input.
      this.stateMachine.terminate();
    }
  }
}
