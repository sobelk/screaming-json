import { describe, it, expect, beforeEach } from "vitest";
import { JSONStateMachine } from "../streaming-json";

function write(str: string, terminate = false) {
  const tokenizer = new JSONStateMachine();
  for (const char of str) {
    tokenizer.writeCharacter(char);
  }

  if (terminate) {
    tokenizer.terminate();
  }

  return tokenizer;
}

describe("CharacterTokenizer", () => {
  describe("valid JSON parsing", () => {
    it("should parse empty object", () => {
      expect(() => {
        write("{}");
      }).not.toThrow();
    });

    it("should parse empty array", () => {
      expect(() => {
        write("[]");
      }).not.toThrow();
    });

    it("should parse simple object with string value", () => {
      expect(() => {
        write('{"key":"value"}');
      }).not.toThrow();
    });

    it("should parse nested objects", () => {
      expect(() => {
        write('{"obj":{}}');
      }).not.toThrow();
    });

    it("should parse array with multiple values", () => {
      expect(() => {
        write("[1,2,3]");
      }).not.toThrow();
    });

    it("should parse numbers with decimal and exponent", () => {
      expect(() => {
        write('{"num":-1.23e+4}');
      }).not.toThrow();
    });

    it("should parse boolean and null values", () => {
      expect(() => {
        write('{"b":true,"n":null}');
      }).not.toThrow();
    });

    it("should parse deeply nested objects", () => {
      expect(() => {
        write('{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{}}}}}}}}}}}');
      }).not.toThrow();
    });

    it("should parse deeply nested arrays", () => {
      expect(() => {
        write("[[[[[[[[[[[]]]]]]]]]]]");
      }).not.toThrow();
    });

    it("should parse mixed nested structures", () => {
      expect(() => {
        write('{"a":[{"b":{"c":[1,2,3]}},"string",true,{"d":null}]}');
      }).not.toThrow();
    });

    it("should parse complex object with all value types", () => {
      expect(() => {
        write(
          '{"str":"value","num":123.45,"bool":true,"null":null,"arr":[1,2,3],"obj":{"nested":"value"}}'
        );
      }).not.toThrow();
    });

    it("should parse array with mixed types", () => {
      expect(() => {
        write('[1,"two",true,null,{"key":"value"}]');
      }).not.toThrow();
    });

    it("should parse object with nested arrays and objects", () => {
      expect(() => {
        write('{"arr":[1,2,3],"obj":{"nested":{"arr":[4,5,6]},"str":"value"}}');
      }).not.toThrow();
    });

    it("should allow termination after complete number", () => {
      expect(() => {
        write("123", true);
      }).not.toThrow();
    });

    it("should allow termination after complete decimal number", () => {
      expect(() => {
        write("123.45", true);
      }).not.toThrow();
    });

    it("should allow termination after complete scientific notation number", () => {
      expect(() => {
        write("1.23e+4", true);
      }).not.toThrow();
    });

    it("should allow termination after complete object", () => {
      expect(() => {
        write('{"key":"value"}', true);
      }).not.toThrow();
    });

    it("should allow termination after complete array", () => {
      expect(() => {
        write("[1,2,3]", true);
      }).not.toThrow();
    });

    it("should throw error on premature termination in object", () => {
      expect(() => {
        write('{"key":"value"', true);
      }).toThrow("Premature string termination");
    });

    it("should throw error on premature termination in array", () => {
      expect(() => {
        write("[1,2,3", true);
      }).toThrow("Premature string termination");
    });

    it("should throw error on premature termination in string", () => {
      expect(() => {
        write('"unclosed string', true);
      }).toThrow("Premature string termination");
    });

    it("should throw error on premature termination in number", () => {
      expect(() => {
        write("1.", true);
      }).toThrow("Premature string termination");
    });

    it("should throw error on premature termination in scientific notation", () => {
      expect(() => {
        write("1.23e+", true);
      }).toThrow("Premature string termination");
    });
  });

  describe("invalid JSON parsing", () => {
    it("should throw error on invalid character after object start", () => {
      expect(() => {
        write("{x");
      }).toThrow();
    });

    it("should throw error on invalid character after array start", () => {
      expect(() => {
        write("[x");
      }).toThrow();
    });

    it("should throw error on invalid escape sequence", () => {
      expect(() => {
        write('"\\x"');
      }).toThrow();
    });

    it("should throw error on incomplete unicode escape", () => {
      expect(() => {
        write('"\\u123"');
      }).toThrow();
    });

    it("should throw error on invalid number format", () => {
      expect(() => {
        write("1.e");
      }).toThrow();
    });

    it("should throw error on missing exponent digits after e", () => {
      expect(() => {
        write("1.23e", true);
      }).toThrow();
    });

    it("should throw error on missing exponent digits after e+", () => {
      expect(() => {
        write("1.23e+", true);
      }).toThrow();
    });

    it("should throw error on missing exponent digits after e-", () => {
      expect(() => {
        write("1.23e-", true);
      }).toThrow();
    });

    it("should throw error on invalid character after e", () => {
      expect(() => {
        write("1.23ex");
      }).toThrow();
    });

    it("should throw error on invalid character after e+", () => {
      expect(() => {
        write("1.23e+x");
      }).toThrow();
    });

    it("should throw error on invalid character after e-", () => {
      expect(() => {
        write("1.23e-x");
      }).toThrow();
    });

    it("should parse valid scientific notation with single exponent digit", () => {
      expect(() => {
        write("1.23e1");
      }).not.toThrow();
    });

    it("should parse valid scientific notation with multiple exponent digits", () => {
      expect(() => {
        write("1.23e12");
      }).not.toThrow();
    });

    it("should parse valid scientific notation with positive exponent", () => {
      expect(() => {
        write("1.23e+12");
      }).not.toThrow();
    });

    it("should parse valid scientific notation with negative exponent", () => {
      expect(() => {
        write("1.23e-12");
      }).not.toThrow();
    });

    it("should throw error on invalid boolean value", () => {
      expect(() => {
        write("trux");
      }).toThrow();
    });

    it("should throw error on invalid null value", () => {
      expect(() => {
        write("nulx");
      }).toThrow();
    });

    it("should throw error on invalid object key format", () => {
      expect(() => {
        write("{key");
      }).toThrow();
    });
  });
});
