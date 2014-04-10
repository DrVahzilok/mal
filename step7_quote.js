if (typeof module !== 'undefined') {
    var types = require('./types');
    var readline = require('./node_readline');
    var reader = require('./reader');
    var printer = require('./printer');
    var Env = require('./env').Env;
    var core = require('./core');
}

// read
function READ(str) {
    return reader.read_str(str);
}

// eval
function is_pair(x) {
    return types._sequential_Q(x) && x.length > 0;
}

function quasiquote(ast) {
    if (!is_pair(ast)) {
        return [types._symbol("quote"), ast];
    } else if (ast[0].value === 'unquote') {
        return ast[1];
    } else if (is_pair(ast[0]) && ast[0][0].value === 'splice-unquote') {
        return [types._symbol("concat"), ast[0][1], quasiquote(ast.slice(1))];
    } else {
        return [types._symbol("cons"), quasiquote(ast[0]), quasiquote(ast.slice(1))];
    }
}

function eval_ast(ast, env) {
    if (types._symbol_Q(ast)) {
        return env.get(ast);
    } else if (types._list_Q(ast)) {
        return ast.map(function(a) { return EVAL(a, env); });
    } else if (types._vector_Q(ast)) {
        var v = ast.map(function(a) { return EVAL(a, env); });
        v.__isvector__ = true;
        return v;
    } else if (types._hash_map_Q(ast)) {
        var new_hm = {};
        for (k in ast) {
            new_hm[EVAL(k, env)] = EVAL(ast[k], env);
        }
        return new_hm;
    } else {
        return ast;
    }
}

function _EVAL(ast, env) {
    while (true) {

    //printer.println("EVAL:", types._pr_str(ast, true));
    if (!types._list_Q(ast)) {
        return eval_ast(ast, env);
    }

    // apply list
    var a0 = ast[0], a1 = ast[1], a2 = ast[2], a3 = ast[3];
    switch (a0.value) {
    case "def!":
        var res = EVAL(a2, env);
        return env.set(a1, res);
    case "let*":
        var let_env = new Env(env);
        for (var i=0; i < a1.length; i+=2) {
            let_env.set(a1[i].value, EVAL(a1[i+1], let_env));
        }
        return EVAL(a2, let_env);
    case "quote":
        return a1;
    case "quasiquote":
        return EVAL(quasiquote(a1), env);
    case "do":
        eval_ast(ast.slice(1, -1), env);
        ast = ast[ast.length-1];
        break;
    case "if":
        var cond = EVAL(a1, env);
        if (cond === null || cond === false) {
            ast = (typeof a3 !== "undefined") ? a3 : null;
        } else {
            ast = a2;
        }
        break;
    case "fn*":
        return types._function(EVAL, Env, a2, env, a1);
    default:
        var el = eval_ast(ast, env), f = el[0], meta = f.__meta__;
        if (f.__ast__) {
            ast = f.__ast__;
            env = f.__gen_env__(el.slice(1));
        } else {
            return f.apply(f, el.slice(1));
        }
    }

    }
}

function EVAL(ast, env) {
    var result = _EVAL(ast, env);
    return (typeof result !== "undefined") ? result : null;
}

// print
function PRINT(exp) {
    return printer._pr_str(exp, true);
}

// repl
var repl_env = new Env();
var rep = function(str) { return PRINT(EVAL(READ(str), repl_env)); };
_ref = function (k,v) { repl_env.set(k, v); }

// Import core functions
for (var n in core.ns) { repl_env.set(n, core.ns[n]); }

_ref('read-string', reader.read_str);
_ref('eval', function(ast) { return EVAL(ast, repl_env); });
_ref('slurp', function(f) {
    return require('fs').readFileSync(f, 'utf-8');
});

// Defined using the language itself
rep("(def! not (fn* (a) (if a false true)))");
rep("(def! load-file (fn* (f) (eval (read-string (str \"(do \" (slurp f) \")\")))))");

if (typeof process !== 'undefined' && process.argv.length > 2) {
    for (var i=2; i < process.argv.length; i++) {
        rep('(load-file "' + process.argv[i] + '")');
    }
} else if (typeof require === 'undefined') {
    // Asynchronous browser mode
    readline.rlwrap(function(line) { return rep(line); },
                    function(exc) {
                        if (exc instanceof reader.BlankException) { return; }
                        if (exc.stack) { printer.println(exc.stack); }
                        else           { printer.println(exc); }
                    });
} else if (require.main === module) {
    // Synchronous node.js commandline mode
    while (true) {
        var line = readline.readline("user> ");
        if (line === null) { break; }
        try {
            if (line) { printer.println(rep(line)); }
        } catch (exc) {
            if (exc instanceof reader.BlankException) { continue; }
            if (exc.stack) { printer.println(exc.stack); }
            else           { printer.println(exc); }
        }
    }
} else {
    exports.rep = rep;
}
