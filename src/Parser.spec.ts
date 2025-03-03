import { Parser, Tokenizer } from "./index.js";
import type { Handler, ParserOptions } from "./Parser.js";

describe("API", () => {
    test("should work without callbacks", () => {
        const cbs: Partial<Handler> = { onerror: jest.fn() };
        const p = new Parser(cbs, {
            xmlMode: true,
            lowerCaseAttributeNames: true,
        });

        p.end("<a foo><bar></a><!-- --><![CDATA[]]]><?foo?><!bar><boo/>boohay");
        p.write("foo");

        // Check for an error
        p.end();
        p.write("foo");
        expect(cbs.onerror).toHaveBeenLastCalledWith(
            new Error(".write() after done!"),
        );
        p.end();
        expect(cbs.onerror).toHaveBeenLastCalledWith(
            new Error(".end() after done!"),
        );

        // Should ignore the error if there is no callback
        delete cbs.onerror;
        p.write("foo");

        p.reset();

        // Remove method
        cbs.onopentag = jest.fn();
        p.write("<a foo");
        delete cbs.onopentag;
        p.write(">");

        // Pause/resume
        const onText = jest.fn();
        cbs.ontext = onText;
        p.pause();
        p.write("foo");
        expect(onText).not.toHaveBeenCalled();
        p.resume();
        expect(onText).toHaveBeenLastCalledWith("foo");
        p.pause();
        expect(onText).toHaveBeenCalledTimes(1);
        p.resume();
        expect(onText).toHaveBeenCalledTimes(1);
        p.pause();
        p.end("bar");
        expect(onText).toHaveBeenCalledTimes(1);
        p.resume();
        expect(onText).toHaveBeenCalledTimes(2);
        expect(onText).toHaveBeenLastCalledWith("bar");
    });

    test("should back out of numeric entities (#125)", () => {
        const onend = jest.fn();
        let text = "";
        const p = new Parser({
            ontext(data) {
                text += data;
            },
            onend,
        });

        p.end("id=770&#anchor");

        expect(onend).toHaveBeenCalledTimes(1);
        expect(text).toBe("id=770&#anchor");

        p.reset();
        text = "";

        p.end("0&#xn");

        expect(onend).toHaveBeenCalledTimes(2);
        expect(text).toBe("0&#xn");
    });

    test("should not have the start index be greater than the end index", () => {
        const onopentag = jest.fn();
        const onclosetag = jest.fn();

        const p = new Parser({
            onopentag(tag) {
                expect(p.startIndex).toBeLessThanOrEqual(p.endIndex);
                onopentag(tag, p.startIndex, p.endIndex);
            },
            onclosetag(tag) {
                expect(p.startIndex).toBeLessThanOrEqual(p.endIndex);
                onclosetag(tag, p.endIndex);
            },
        });

        p.write("<p>");

        expect(onopentag).toHaveBeenLastCalledWith("p", 0, 2);
        expect(onclosetag).not.toHaveBeenCalled();

        p.write("Foo");

        p.write("<hr>");

        expect(onopentag).toHaveBeenLastCalledWith("hr", 6, 9);
        expect(onclosetag).toHaveBeenCalledTimes(2);
        expect(onclosetag).toHaveBeenNthCalledWith(1, "p", 9);
        expect(onclosetag).toHaveBeenNthCalledWith(2, "hr", 9);
    });

    test("should update the position when a single tag is spread across multiple chunks", () => {
        let called = false;
        const p = new Parser({
            onopentag() {
                called = true;
                expect(p.startIndex).toBe(0);
                expect(p.endIndex).toBe(12);
            },
        });

        p.write("<div ");
        p.write("foo=bar>");

        expect(called).toBe(true);
    });

    test("should have the correct position for implied opening tags", () => {
        let called = false;
        const p = new Parser({
            onopentag() {
                called = true;
                expect(p.startIndex).toBe(0);
                expect(p.endIndex).toBe(3);
            },
        });

        p.write("</p>");
        expect(called).toBe(true);
    });

    test("should parse <__proto__> (#387)", () => {
        const p = new Parser(null);

        // Should not throw
        p.parseChunk("<__proto__>");
    });

    test("should support custom tokenizer", () => {
        class CustomTokenizer extends Tokenizer {}

        const p = new Parser(
            {
                onparserinit(parser: Parser) {
                    // @ts-expect-error Accessing private tokenizer here
                    expect(parser.tokenizer).toBeInstanceOf(CustomTokenizer);
                },
            },
            { Tokenizer: CustomTokenizer },
        );
        p.done();
    });

    describe('should apply default values correctly with or without xmlMode', () => {
        
        let actual : (string | { [s: string]: string | boolean } | boolean)[] = [];
        
        const handler: Partial<Handler> = {
            onreset: () => actual = [],
            onopentagname: tag => actual.push({ tag }),
            onattribute: attribute => actual.push({ attr: attribute }),
            ontext: text => actual.push({ text }),
            onclosetag: (_, implied) => actual.push({ implied })
        };

        const testOptions = (options : ParserOptions) => {
            const p = new Parser(handler, options);
            p.parseComplete(`<Component/><input maxLength="10">&nbsp;<![CDATA[test]]]>`);
            
            expect(actual).toEqual([
                { tag: 'component' },
                { tag: 'input' },
                { attr: 'maxLength' },
                { implied: true },
                { text: "\u00A0" },
                { implied: true }
            ]);
        }

        test("when explicitly set", () => {
            testOptions({
                decodeEntities: true,
                lowerCaseTags: true,
                lowerCaseAttributeNames: false,
                recognizeCDATA: false,
                recognizeSelfClosing: false,
            });
        });
        test("when xmlMode is false", () => {
            testOptions({
                xmlMode: false
            });
        });
        test("when pure defaults used", () => {
            testOptions({});
        });
    });
});

