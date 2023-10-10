import { atom, computed } from "nanostores";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error
import createFetchMock from "vitest-fetch-mock";
import createClient from "../src/index.js";
import type { paths } from "./v1.js";

const fetchMocker = createFetchMock(vi);

beforeAll(() => {
  fetchMocker.enableMocks();
});
afterEach(() => {
  fetchMocker.resetMocks();
});

interface MockResponse {
  headers?: Record<string, string>;
  status: number;
  body: any;
}

function mockFetch(res: MockResponse) {
  fetchMocker.mockResponse(() => res);
}

function mockFetchOnce(res: MockResponse) {
  fetchMocker.mockResponseOnce(() => res);
}

describe("client", () => {
  it("generates all proper functions", () => {
    const client = createClient<paths>();

    expect(client).toHaveProperty("DELETE");
    expect(client).toHaveProperty("OPTIONS");
    expect(client).toHaveProperty("HEAD");
    expect(client).toHaveProperty("PATCH");
    expect(client).toHaveProperty("TRACE");
  });

  describe("TypeScript checks", () => {
    it("marks data or error as undefined, but never both", async () => {
      const client = createClient<paths>();

      // data
      mockFetchOnce({
        status: 200,
        body: JSON.stringify(["one", "two", "three"]),
      });
      const dataRes = await client.core("get", "/string-array");

      // … is initially possibly undefined
      // @ts-expect-error
      expect(dataRes.data[0]).toBe("one");

      // … is present if error is undefined
      if (!dataRes.error) {
        expect(dataRes.data[0]).toBe("one");
      }

      // … means data is undefined
      if (dataRes.data) {
        // @ts-expect-error
        expect(() => dataRes.error.message).toThrow();
      }

      // error
      mockFetchOnce({
        status: 500,
        body: JSON.stringify({ code: 500, message: "Something went wrong" }),
      });
      const errorRes = await client.core("get", "/string-array");

      // … is initially possibly undefined
      // @ts-expect-error
      expect(errorRes.error.message).toBe("Something went wrong");

      // … is present if error is undefined
      if (!errorRes.data) {
        expect(errorRes.error.message).toBe("Something went wrong");
      }

      // … means data is undefined
      if (errorRes.error) {
        // @ts-expect-error
        expect(() => errorRes.data[0]).toThrow();
      }
    });

    describe("params", () => {
      it("path", async () => {
        const client = createClient<paths>({ baseUrl: "https://myapi.com/v1" });
        mockFetch({ status: 200, body: JSON.stringify({ message: "OK" }) });

        // expect error on missing 'params'
        // @ts-expect-error
        await client.core("get", "/blogposts/{post_id}");

        // expect error on empty params
        // @ts-expect-error
        await client.core("get", "/blogposts/{post_id}", { params: {} });

        // expect error on empty params.path
        await client.core("get", "/blogposts/{post_id}", {
          params: {
            // @ts-expect-error
            path: {},
          },
        });

        // expect error on mismatched type (number v string)
        await client.core("get", "/blogposts/{post_id}", {
          // @ts-expect-error
          params: { path: { post_id: 1234 } },
        });

        // (no error)
        await client.core("get", "/blogposts/{post_id}", {
          params: { path: { post_id: "1234" } },
        });

        // expect param passed correctly
        const lastCall =
          fetchMocker.mock.calls[fetchMocker.mock.calls.length - 1];
        expect(lastCall[0]).toBe("https://myapi.com/v1/blogposts/1234");
      });

      it("header", async () => {
        const client = createClient<paths>({ baseUrl: "https://myapi.com/v1" });
        mockFetch({ status: 200, body: JSON.stringify({ status: "success" }) });

        // expet error on missing header
        // @ts-expect-error
        await client.core("get", "/header-params");

        // expect error on incorrect header
        await client.core("get", "/header-params", {
          // @ts-expect-error
          params: { header: { foo: "bar" } },
        });

        // expect error on mismatched type
        await client.core("get", "/header-params", {
          // @ts-expect-error
          params: { header: { "x-required-header": true } },
        });

        // (no error)
        await client.core("get", "/header-params", {
          params: { header: { "x-required-header": "correct" } },
        });

        // expect param passed correctly
        const lastCall =
          fetchMocker.mock.calls[fetchMocker.mock.calls.length - 1];
        expect(lastCall[1].headers.get("x-required-header")).toBe("correct");
      });

      describe("query", () => {
        it("basic", async () => {
          const client = createClient<paths>();
          mockFetchOnce({ status: 200, body: "{}" });
          await client.core("get", "/blogposts/{post_id}", {
            params: {
              path: { post_id: "my-post" },
              query: { version: 2, format: "json" },
            },
          });

          expect(fetchMocker.mock.calls[0][0]).toBe(
            "/blogposts/my-post?version=2&format=json",
          );
        });

        it("array params", async () => {
          const client = createClient<paths>();
          mockFetchOnce({ status: 200, body: "{}" });
          await client.core("get", "/blogposts", {
            params: {
              query: { tags: ["one", "two", "three"] },
            },
          });

          expect(fetchMocker.mock.calls[0][0]).toBe(
            "/blogposts?tags=one%2Ctwo%2Cthree",
          );
        });

        it("empty/null params", async () => {
          const client = createClient<paths>();
          mockFetchOnce({ status: 200, body: "{}" });
          await client.core("get", "/blogposts/{post_id}", {
            params: {
              path: { post_id: "my-post" },
              query: { version: undefined, format: null as any },
            },
          });

          expect(fetchMocker.mock.calls[0][0]).toBe("/blogposts/my-post");
        });

        describe("querySerializer", () => {
          it("custom", async () => {
            const client = createClient<paths>();
            mockFetchOnce({ status: 200, body: "{}" });
            await client.core("get", "/blogposts/{post_id}", {
              params: {
                path: { post_id: "my-post" },
                query: { version: 2, format: "json" },
              },
              querySerializer: (q) => `alpha=${q.version}&beta=${q.format}`,
            });

            expect(fetchMocker.mock.calls[0][0]).toBe(
              "/blogposts/my-post?alpha=2&beta=json",
            );
          });

          it("applies global serializer", async () => {
            const client = createClient<paths>({
              querySerializer: (q) => `alpha=${q.version}&beta=${q.format}`,
            });
            mockFetchOnce({ status: 200, body: "{}" });
            await client.core("get", "/blogposts/{post_id}", {
              params: {
                path: { post_id: "my-post" },
                query: { version: 2, format: "json" },
              },
            });

            expect(fetchMocker.mock.calls[0][0]).toBe(
              "/blogposts/my-post?alpha=2&beta=json",
            );
          });

          it("overrides global serializer if provided", async () => {
            const client = createClient<paths>({
              querySerializer: () => "query",
            });
            mockFetchOnce({ status: 200, body: "{}" });
            await client.core("get", "/blogposts/{post_id}", {
              params: {
                path: { post_id: "my-post" },
                query: { version: 2, format: "json" },
              },
              querySerializer: (q) => `alpha=${q.version}&beta=${q.format}`,
            });

            expect(fetchMocker.mock.calls[0][0]).toBe(
              "/blogposts/my-post?alpha=2&beta=json",
            );
          });
        });
      });
    });

    describe("body", () => {
      // these are pure type tests; no runtime assertions needed
      /* eslint-disable vitest/expect-expect */
      it("requires necessary requestBodies", async () => {
        const client = createClient<paths>({ baseUrl: "https://myapi.com/v1" });
        mockFetch({ status: 200, body: JSON.stringify({ message: "OK" }) });

        // expect error on missing `body`
        // @ts-expect-error
        await client.core("put", "/blogposts");

        // expect error on missing fields
        // @ts-expect-error
        await client.core("put", "/blogposts", { body: { title: "Foo" } });

        // expect present body to be good enough (all fields optional)
        // (no error)
        await client.core("put", "/blogposts", {
          body: {
            title: "Foo",
            body: "Bar",
            publish_date: new Date("2023-04-01T12:00:00Z").getTime(),
          },
        });
      });

      it("requestBody (inline)", async () => {
        mockFetch({ status: 201, body: "{}" });
        const client = createClient<paths>();

        // expect error on wrong body type
        await client.core("put", "/blogposts-optional-inline", {
          // @ts-expect-error
          body: { error: true },
        });

        // (no error)
        await client.core("put", "/blogposts-optional-inline", {
          body: {
            title: "",
            publish_date: 3,
            body: "",
          },
        });
      });

      it("requestBody with required: false", async () => {
        mockFetch({ status: 201, body: "{}" });
        const client = createClient<paths>();

        // assert missing `body` doesn’t raise a TS error
        await client.core("put", "/blogposts-optional");

        // assert error on type mismatch
        await client.core("put", "/blogposts-optional", {
          body: {
            // @ts-expect-error
            error: true,
          },
        });

        // (no error)
        await client.core("put", "/blogposts-optional", {
          body: {
            title: "",
            publish_date: 3,
            body: "",
          },
        });
      });
    });
    /* eslint-enable vitest/expect-expect */
  });

  describe("options", () => {
    it("respects baseUrl", async () => {
      let client = createClient<paths>({ baseUrl: "https://myapi.com/v1" });
      mockFetch({ status: 200, body: JSON.stringify({ message: "OK" }) });
      await client.core("get", "/self");

      // assert baseUrl and path mesh as expected
      expect(fetchMocker.mock.calls[0][0]).toBe("https://myapi.com/v1/self");

      client = createClient<paths>({ baseUrl: "https://myapi.com/v1/" });
      await client.core("get", "/self");
      // assert trailing '/' was removed
      expect(fetchMocker.mock.calls[1][0]).toBe("https://myapi.com/v1/self");
    });

    it("preserves default headers", async () => {
      const headers: HeadersInit = { Authorization: "Bearer secrettoken" };

      const client = createClient<paths>({ headers });
      mockFetchOnce({
        status: 200,
        body: JSON.stringify({ email: "user@user.com" }),
      });
      await client.core("get", "/self");

      // assert default headers were passed
      const options = fetchMocker.mock.calls[0][1];
      expect(options?.headers).toEqual(
        new Headers({
          ...headers, // assert new header got passed
          "Content-Type": "application/json", //  probably doesn’t need to get tested, but this was simpler than writing lots of code to ignore these
        }),
      );
    });

    it("allows override headers", async () => {
      const client = createClient<paths>({
        headers: { "Cache-Control": "max-age=10000000" },
      });
      mockFetchOnce({
        status: 200,
        body: JSON.stringify({ email: "user@user.com" }),
      });
      await client.core("get", "/self", {
        params: {},
        headers: { "Cache-Control": "no-cache" },
      });

      // assert default headers were passed
      const options = fetchMocker.mock.calls[0][1];
      expect(options?.headers).toEqual(
        new Headers({
          "Cache-Control": "no-cache",
          "Content-Type": "application/json",
        }),
      );
    });

    it("allows unsetting headers", async () => {
      const client = createClient<paths>({ headers: { "Content-Type": null } });
      mockFetchOnce({
        status: 200,
        body: JSON.stringify({ email: "user@user.com" }),
      });
      await client.core("get", "/self", { params: {} });

      // assert default headers were passed
      const options = fetchMocker.mock.calls[0][1];
      expect(options?.headers).toEqual(new Headers());
    });

    it("accepts a custom fetch function on createClient", async () => {
      function createCustomFetch(data: any) {
        const response = {
          clone: () => ({ ...response }),
          headers: new Headers(),
          json: async () => data,
          status: 200,
          ok: true,
        } as Response;
        return async () => Promise.resolve(response);
      }

      const customFetch = createCustomFetch({ works: true });
      mockFetchOnce({ status: 200, body: "{}" });

      const client = createClient<paths>({ fetch: customFetch });
      const { data } = await client.core("get", "/self");

      // assert data was returned from custom fetcher
      expect(data).toEqual({ works: true });

      // assert global fetch was never called
      expect(fetchMocker).not.toHaveBeenCalled();
    });

    it("accepts a custom fetch function per-request", async () => {
      function createCustomFetch(data: any) {
        const response = {
          clone: () => ({ ...response }),
          headers: new Headers(),
          json: async () => data,
          status: 200,
          ok: true,
        } as Response;
        return async () => Promise.resolve(response);
      }

      const fallbackFetch = createCustomFetch({ fetcher: "fallback" });
      const overrideFetch = createCustomFetch({ fetcher: "override" });

      mockFetchOnce({ status: 200, body: "{}" });

      const client = createClient<paths>({ fetch: fallbackFetch });

      // assert override function was called
      const fetch1 = await client.core("get", "/self", {
        fetch: overrideFetch,
      });
      expect(fetch1.data).toEqual({ fetcher: "override" });

      // assert fallback function still persisted (and wasn’t overridden)
      const fetch2 = await client.core("get", "/self");
      expect(fetch2.data).toEqual({ fetcher: "fallback" });

      // assert global fetch was never called
      expect(fetchMocker).not.toHaveBeenCalled();
    });
  });

  describe("requests", () => {
    it("escapes URLs properly", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("get", "/blogposts/{post_id}", {
        params: {
          path: {
            post_id: "post?id = 🥴",
          },
        },
      });

      // expect post_id to be encoded properly
      expect(fetchMocker.mock.calls[0][0]).toBe(
        "/blogposts/post%3Fid%20%3D%20%F0%9F%A5%B4",
      );
    });

    it("multipart/form-data", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("put", "/contact", {
        body: {
          name: "John Doe",
          email: "test@email.email",
          subject: "Test Message",
          message: "This is a test message",
        },
        bodySerializer(body) {
          const fd = new FormData();
          for (const [k, v] of Object.entries(body)) {
            fd.append(k, v);
          }
          return fd;
        },
      });

      // expect post_id to be encoded properly
      const req = fetchMocker.mock.calls[0][1];
      expect(req.body).toBeInstanceOf(FormData);

      // TODO: `vitest-fetch-mock` does not add the boundary to the Content-Type header like browsers do, so we expect the header to be null instead
      expect((req.headers as Headers).get("Content-Type")).toBeNull();
    });
  });

  describe("responses", () => {
    it("returns empty object on 204", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 204, body: "" });
      const { data, error, response } = await client.core(
        "delete",
        "/tag/{name}",
        {
          params: { path: { name: "New Tag" } },
        },
      );

      // assert correct data was returned
      expect(data).toEqual({});
      expect(response.status).toBe(204);

      // assert error is empty
      expect(error).toBeUndefined();
    });

    it("treats `default` as an error", async () => {
      const client = createClient<paths>({
        headers: { "Cache-Control": "max-age=10000000" },
      });
      mockFetchOnce({
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: 500,
          message: "An unexpected error occurred",
        }),
      });
      const { error } = await client.core("get", "/default-as-error");

      // discard `data` object
      if (!error) {
        throw new Error(
          "treats `default` as an error: error response should be present",
        );
      }

      // assert `error.message` doesn’t throw TS error
      expect(error.message).toBe("An unexpected error occurred");
    });

    describe("parseAs", () => {
      it("text", async () => {
        const client = createClient<paths>();
        mockFetchOnce({ status: 200, body: "{}" });
        const { data } = await client.core("get", "/anyMethod", {
          parseAs: "text",
        });
        expect(data).toBe("{}");
      });

      it("arrayBuffer", async () => {
        const client = createClient<paths>();
        mockFetchOnce({ status: 200, body: "{}" });
        const { data } = await client.core("get", "/anyMethod", {
          parseAs: "arrayBuffer",
        });
        expect(data instanceof ArrayBuffer).toBe(true);
      });

      it("blob", async () => {
        const client = createClient<paths>();
        mockFetchOnce({ status: 200, body: "{}" });
        const { data } = await client.core("get", "/anyMethod", {
          parseAs: "blob",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((data as any).constructor.name).toBe("Blob");
      });

      it("stream", async () => {
        const client = createClient<paths>();
        mockFetchOnce({ status: 200, body: "{}" });
        const { data } = await client.core("get", "/anyMethod", {
          parseAs: "stream",
        });
        expect(data instanceof Buffer).toBe(true);
      });
    });
  });

  describe("GET()", () => {
    it("sends the correct method", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("get", "/anyMethod");
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("GET");
    });

    it("sends correct options, returns success", async () => {
      const mockData = {
        title: "My Post",
        body: "<p>This is a very good post</p>",
        publish_date: new Date("2023-03-01T12:00:00Z").getTime(),
      };
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: JSON.stringify(mockData) });
      const { data, error, response } = await client.core(
        "get",
        "/blogposts/{post_id}",
        {
          params: { path: { post_id: "my-post" } },
        },
      );

      // assert correct URL was called
      expect(fetchMocker.mock.calls[0][0]).toBe("/blogposts/my-post");

      // assert correct data was returned
      expect(data).toEqual(mockData);
      expect(response.status).toBe(200);

      // assert error is empty
      expect(error).toBeUndefined();
    });

    it("sends correct options, returns error", async () => {
      const mockError = { code: 404, message: "Post not found" };
      const client = createClient<paths>();
      mockFetchOnce({ status: 404, body: JSON.stringify(mockError) });
      const { data, error, response } = await client.core(
        "get",
        "/blogposts/{post_id}",
        {
          params: { path: { post_id: "my-post" } },
        },
      );

      // assert correct URL was called
      expect(fetchMocker.mock.calls[0][0]).toBe("/blogposts/my-post");

      // assert correct method was called
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("GET");

      // assert correct error was returned
      expect(error).toEqual(mockError);
      expect(response.status).toBe(404);

      // assert data is empty
      expect(data).toBeUndefined();
    });

    // note: this was a previous bug in the type inference
    it("handles array-type responses", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "[]" });
      const { data } = await client.core("get", "/blogposts", { params: {} });
      if (!data) {
        throw new Error("data empty");
      }

      // assert array type (and only array type) was inferred
      expect(data.length).toBe(0);
    });

    it("handles literal 2XX and 4XX codes", async () => {
      const client = createClient<paths>();
      mockFetch({ status: 201, body: '{"status": "success"}' });
      const { data, error } = await client.core("put", "/media", {
        body: { media: "base64", name: "myImage" },
      });

      if (data) {
        // assert 2XX type inferred correctly
        expect(data.status).toBe("success");
      } else {
        // assert 4XX type inferred correctly
        // (this should be a dead code path but tests TS types)
        expect(error.message).toBe("Error");
      }
    });
  });

  describe("core('post', )", () => {
    it("sends the correct method", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("post", "/anyMethod");
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("POST");
    });

    it("sends correct options, returns success", async () => {
      const mockData = { status: "success" };
      const client = createClient<paths>();
      mockFetchOnce({ status: 201, body: JSON.stringify(mockData) });
      const { data, error, response } = await client.core("put", "/blogposts", {
        body: {
          title: "New Post",
          body: "<p>Best post yet</p>",
          publish_date: new Date("2023-03-31T12:00:00Z").getTime(),
        },
      });

      // assert correct URL was called
      expect(fetchMocker.mock.calls[0][0]).toBe("/blogposts");

      // assert correct data was returned
      expect(data).toEqual(mockData);
      expect(response.status).toBe(201);

      // assert error is empty
      expect(error).toBeUndefined();
    });

    it("supports sepecifying utf-8 encoding", async () => {
      const mockData = { message: "My reply" };
      const client = createClient<paths>();
      mockFetchOnce({ status: 201, body: JSON.stringify(mockData) });
      const { data, error, response } = await client.core("put", "/comment", {
        params: {},
        body: {
          message: "My reply",
          replied_at: new Date("2023-03-31T12:00:00Z").getTime(),
        },
      });

      // assert correct data was returned
      expect(data).toEqual(mockData);
      expect(response.status).toBe(201);

      // assert error is empty
      expect(error).toBeUndefined();
    });
  });

  describe("core('delete', )", () => {
    it("sends the correct method", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("delete", "/anyMethod");
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("DELETE");
    });

    it("returns empty object on 204", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 204, body: "" });
      const { data, error } = await client.core(
        "delete",
        "/blogposts/{post_id}",
        {
          params: {
            path: { post_id: "123" },
          },
        },
      );

      // assert correct data was returned
      expect(data).toEqual({});

      // assert error is empty
      expect(error).toBeUndefined();
    });

    it("returns empty object on Content-Length: 0", async () => {
      const client = createClient<paths>();
      mockFetchOnce({
        headers: { "Content-Length": "0" },
        status: 200,
        body: "",
      });
      const { data, error } = await client.core(
        "delete",
        "/blogposts/{post_id}",
        {
          params: {
            path: { post_id: "123" },
          },
        },
      );

      // assert correct data was returned
      expect(data).toEqual({});

      // assert error is empty
      expect(error).toBeUndefined();
    });
  });

  describe("core('options', )", () => {
    it("sends the correct method", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("options", "/anyMethod");
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("OPTIONS");
    });
  });

  describe("core('head', )", () => {
    it("sends the correct method", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("head", "/anyMethod");
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("HEAD");
    });
  });

  describe("core('patch', )", () => {
    it("sends the correct method", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("patch", "/anyMethod");
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("PATCH");
    });
  });

  describe("core('trace', )", () => {
    it("sends the correct method", async () => {
      const client = createClient<paths>();
      mockFetchOnce({ status: 200, body: "{}" });
      await client.core("trace", "/anyMethod");
      expect(fetchMocker.mock.calls[0][1]?.method).toBe("TRACE");
    });
  });
});

// test that the library behaves as expected inside commonly-used patterns
describe("examples", () => {
  it("nanostores", async () => {
    const token = atom<string | undefined>();
    const client = computed([token], (currentToken) =>
      createClient<paths>({
        headers: currentToken
          ? { Authorization: `Bearer ${currentToken}` }
          : {},
      }),
    );

    // assert initial call is unauthenticated
    mockFetchOnce({ status: 200, body: "{}" });
    await client.get().core("get", "/blogposts/{post_id}", {
      params: { path: { post_id: "1234" } },
    });
    expect(
      fetchMocker.mock.calls[0][1].headers.get("authorization"),
    ).toBeNull();

    // assert after setting token, client is authenticated
    const tokenVal = "abcd";
    mockFetchOnce({ status: 200, body: "{}" });
    await new Promise<void>((resolve) =>
      setTimeout(() => {
        token.set(tokenVal); // simulate promise-like token setting
        resolve();
      }, 0),
    );
    await client.get().core("get", "/blogposts/{post_id}", {
      params: { path: { post_id: "1234" } },
    });
    expect(fetchMocker.mock.calls[1][1].headers.get("authorization")).toBe(
      `Bearer ${tokenVal}`,
    );
  });

  it("proxies", async () => {
    let token: string | undefined = undefined;

    const baseClient = createClient<paths>();
    const client = new Proxy(baseClient, {
      get(_, key: keyof typeof baseClient) {
        const newClient = createClient<paths>({
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return newClient[key];
      },
    });

    // assert initial call is unauthenticated
    mockFetchOnce({ status: 200, body: "{}" });
    await client.core("get", "/blogposts/{post_id}", {
      params: { path: { post_id: "1234" } },
    });
    expect(
      fetchMocker.mock.calls[0][1].headers.get("authorization"),
    ).toBeNull();

    // assert after setting token, client is authenticated
    const tokenVal = "abcd";
    mockFetchOnce({ status: 200, body: "{}" });
    await new Promise<void>((resolve) =>
      setTimeout(() => {
        token = tokenVal; // simulate promise-like token setting
        resolve();
      }, 0),
    );
    await client.core("get", "/blogposts/{post_id}", {
      params: { path: { post_id: "1234" } },
    });
    expect(fetchMocker.mock.calls[1][1].headers.get("authorization")).toBe(
      `Bearer ${tokenVal}`,
    );
  });
});
