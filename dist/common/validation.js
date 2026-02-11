"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
function validate(schema, source = 'body') {
    return (req, _res, next) => {
        try {
            const data = schema.parse(req[source]);
            req[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = data;
            if (source === 'body')
                req.body = data;
            if (source === 'query')
                req.validatedQuery = data;
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
//# sourceMappingURL=validation.js.map