// To parse this data:
//
//   import { Convert, Credentials, LambdaFunctionURLEvent, QuestionHistory } from "./file";
//
//   const credentials = Convert.toCredentials(json);
//   const lambdaFunctionURLEvent = Convert.toLambdaFunctionURLEvent(json);
//   const questionHistory = Convert.toQuestionHistory(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface Credentials {
    google:       Google;
    pinecone:     Pinecone;
    openAiApiKey: string;
}

export interface Google {
}

export interface Pinecone {
    namespace:   string;
    environment: string;
    indexName:   string;
    apiKey:      string;
}

export interface LambdaFunctionURLEvent {
    version:         string;
    routeKey:        string;
    rawPath:         string;
    rawQueryString:  string;
    headers:         Headers;
    requestContext:  RequestContext;
    body:            string;
    isBase64Encoded: boolean;
}

export interface Headers {
    authorization:                       string;
    "x-amzn-lambda-proxying-cell":       string;
    "content-length":                    string;
    referer:                             string;
    "x-amzn-tls-version":                string;
    "sec-fetch-site":                    string;
    origin:                              string;
    "x-forwarded-port":                  string;
    "x-amzn-lambda-proxy-auth":          string;
    "x-amzn-tls-cipher-suite":           string;
    "sec-ch-ua-mobile":                  string;
    host:                                string;
    "content-type":                      string;
    "x-amzn-lambda-forwarded-host":      string;
    "sec-fetch-mode":                    string;
    "accept-language":                   string;
    "x-forwarded-proto":                 string;
    dnt:                                 string;
    "x-forwarded-for":                   string;
    accept:                              string;
    "x-amzn-lambda-forwarded-client-ip": string;
    "sec-ch-ua":                         string;
    "x-amzn-trace-id":                   string;
    "sec-ch-ua-platform":                string;
    "accept-encoding":                   string;
    "sec-fetch-dest":                    string;
    "user-agent":                        string;
}

export interface RequestContext {
    accountId:    string;
    apiId:        string;
    domainName:   string;
    domainPrefix: string;
    http:         HTTP;
    requestId:    string;
    routeKey:     string;
    stage:        string;
    time:         string;
    timeEpoch:    number;
}

export interface HTTP {
    method:    string;
    path:      string;
    protocol:  string;
    sourceIp:  string;
    userAgent: string;
}

export interface QuestionHistory {
    question: string;
    history:  any[];
    model:    string;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toCredentials(json: string): Credentials {
        return cast(JSON.parse(json), r("Credentials"));
    }

    public static credentialsToJson(value: Credentials): string {
        return JSON.stringify(uncast(value, r("Credentials")), null, 2);
    }

    public static toLambdaFunctionURLEvent(json: string): LambdaFunctionURLEvent {
        return cast(JSON.parse(json), r("LambdaFunctionURLEvent"));
    }

    public static lambdaFunctionURLEventToJson(value: LambdaFunctionURLEvent): string {
        return JSON.stringify(uncast(value, r("LambdaFunctionURLEvent")), null, 2);
    }

    public static toQuestionHistory(json: string): QuestionHistory {
        return cast(JSON.parse(json), r("QuestionHistory"));
    }

    public static questionHistoryToJson(value: QuestionHistory): string {
        return JSON.stringify(uncast(value, r("QuestionHistory")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "Credentials": o([
        { json: "google", js: "google", typ: r("Google") },
        { json: "pinecone", js: "pinecone", typ: r("Pinecone") },
        { json: "openAiApiKey", js: "openAiApiKey", typ: "" },
    ], false),
    "Google": o([
    ], false),
    "Pinecone": o([
        { json: "namespace", js: "namespace", typ: "" },
        { json: "environment", js: "environment", typ: "" },
        { json: "indexName", js: "indexName", typ: "" },
        { json: "apiKey", js: "apiKey", typ: "" },
    ], false),
    "LambdaFunctionURLEvent": o([
        { json: "version", js: "version", typ: "" },
        { json: "routeKey", js: "routeKey", typ: "" },
        { json: "rawPath", js: "rawPath", typ: "" },
        { json: "rawQueryString", js: "rawQueryString", typ: "" },
        { json: "headers", js: "headers", typ: r("Headers") },
        { json: "requestContext", js: "requestContext", typ: r("RequestContext") },
        { json: "body", js: "body", typ: "" },
        { json: "isBase64Encoded", js: "isBase64Encoded", typ: true },
    ], false),
    "Headers": o([
        { json: "authorization", js: "authorization", typ: "" },
        { json: "x-amzn-lambda-proxying-cell", js: "x-amzn-lambda-proxying-cell", typ: "" },
        { json: "content-length", js: "content-length", typ: "" },
        { json: "referer", js: "referer", typ: "" },
        { json: "x-amzn-tls-version", js: "x-amzn-tls-version", typ: "" },
        { json: "sec-fetch-site", js: "sec-fetch-site", typ: "" },
        { json: "origin", js: "origin", typ: "" },
        { json: "x-forwarded-port", js: "x-forwarded-port", typ: "" },
        { json: "x-amzn-lambda-proxy-auth", js: "x-amzn-lambda-proxy-auth", typ: "" },
        { json: "x-amzn-tls-cipher-suite", js: "x-amzn-tls-cipher-suite", typ: "" },
        { json: "sec-ch-ua-mobile", js: "sec-ch-ua-mobile", typ: "" },
        { json: "host", js: "host", typ: "" },
        { json: "content-type", js: "content-type", typ: "" },
        { json: "x-amzn-lambda-forwarded-host", js: "x-amzn-lambda-forwarded-host", typ: "" },
        { json: "sec-fetch-mode", js: "sec-fetch-mode", typ: "" },
        { json: "accept-language", js: "accept-language", typ: "" },
        { json: "x-forwarded-proto", js: "x-forwarded-proto", typ: "" },
        { json: "dnt", js: "dnt", typ: "" },
        { json: "x-forwarded-for", js: "x-forwarded-for", typ: "" },
        { json: "accept", js: "accept", typ: "" },
        { json: "x-amzn-lambda-forwarded-client-ip", js: "x-amzn-lambda-forwarded-client-ip", typ: "" },
        { json: "sec-ch-ua", js: "sec-ch-ua", typ: "" },
        { json: "x-amzn-trace-id", js: "x-amzn-trace-id", typ: "" },
        { json: "sec-ch-ua-platform", js: "sec-ch-ua-platform", typ: "" },
        { json: "accept-encoding", js: "accept-encoding", typ: "" },
        { json: "sec-fetch-dest", js: "sec-fetch-dest", typ: "" },
        { json: "user-agent", js: "user-agent", typ: "" },
    ], false),
    "RequestContext": o([
        { json: "accountId", js: "accountId", typ: "" },
        { json: "apiId", js: "apiId", typ: "" },
        { json: "domainName", js: "domainName", typ: "" },
        { json: "domainPrefix", js: "domainPrefix", typ: "" },
        { json: "http", js: "http", typ: r("HTTP") },
        { json: "requestId", js: "requestId", typ: "" },
        { json: "routeKey", js: "routeKey", typ: "" },
        { json: "stage", js: "stage", typ: "" },
        { json: "time", js: "time", typ: "" },
        { json: "timeEpoch", js: "timeEpoch", typ: 0 },
    ], false),
    "HTTP": o([
        { json: "method", js: "method", typ: "" },
        { json: "path", js: "path", typ: "" },
        { json: "protocol", js: "protocol", typ: "" },
        { json: "sourceIp", js: "sourceIp", typ: "" },
        { json: "userAgent", js: "userAgent", typ: "" },
    ], false),
    "QuestionHistory": o([
        { json: "question", js: "question", typ: "" },
        { json: "history", js: "history", typ: a("any") },
        { json: "model", js: "model", typ: "" },
    ], false),
};
