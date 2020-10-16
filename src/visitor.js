const antlr4 = require('antlr4');
const Operator = require('./operator');
const { RiScriptVisitor } = require('../grammar/antlr/RiScriptVisitor');
const { RiScriptParser } = require('../grammar/antlr/RiScriptParser');

/*
 * This visitor walks the tree generated by a parser, 
 * evaluating each node as it goes.
 */
class Visitor extends RiScriptVisitor {

  constructor(parent) {
    super();
    this.sequences = {};
    this.parent = parent;
  }

  init(context, opts) {
    this.pendingSymbols = [];
    this.context = context || {};
    this.trace = opts && opts.trace;
    return this;
  }

  // Entry point for tree visiting
  start(ctx) {
    this.indexer = 0;
    if (this.trace) console.log("start: '" + ctx.getText()
      .replace(/\r?\n/g, "\\n") + "'");


    // WORKING HERE ****

    //this.pushTransforms(ctx);
    let result = this.visitScript(ctx).trim();
    //this.popTransforms(ctx);

    return result;
  }
  /*pushTransforms( ctx) {
    for (String tx : RiScript.transforms.keySet()) {
      if (!ctx.containsKey(tx)) {
        ctx.put(tx, RiScript.transforms.get(tx));
        this.appliedTransforms.add(tx);
      }
    }
  popTransforms(ctx) {
    for (let tx : appliedTransforms)
    ctx.remove(tx);
  } */

  ////////////////////// transformable //////////////////////////

  /* output expr value and create a mapping in the symbol table */
  visitInline(ctx) {
    let token = ctx.expr();
    let txs = ctx.transform();
    let id = symbolName(ctx.symbol().getText());

    this.trace && console.log('visitInline: ' + id + '=' +
      this.flatten(token) + ' tfs=[' + (txs || '') + ']');

    // visit the token and add result to the context
    let visited = this.visit(token);
    this.context[id] = visited;

    // apply transforms if we have them
    if (!txs.length) return visited;
    let applied = this.applyTransforms(visited, txs);
    let result = applied || visited + this.flatten(txs);

    this.trace && console.log('resolveInline: $' + id + '=' + result);

    /*  
    // if the inline is not fully resolved, save it for next time
    if (this.parent.isParseable(this.context[id])) {
      this.pendingSymbols.push(id);
      return orig.replace(tokText, this.context[id]);
    } */

    // return result or defer for later
    return result || ctx.getText();
  }

  visitChoice(ctx) {
    let txs = ctx.transform();
    let choice = new ChoiceState(this, ctx); // TODO: handle sequencer (see visitChoiceOld)

    this.trace && console.log("visitChoice: '" + ctx.getText()
      + "' options=['" + this.flatten(choice.options).replace(/\|/g, "','")
      + "'] tfs=" + this.flatten(txs));

    // make the selection
    let tok = choice.select();
    if (this.trace) console.log("  select: '" + tok.getText()
      + "' [" + this.getRuleName(tok) + "]");

    // now visit the token 
    let visited = this.visit(tok);

    // now check for transforms
    if (!txs.length) return visited;
    let applied = this.applyTransforms(visited, txs);
    let result = applied || (visited + this.flatten(txs));

    if (this.trace) console.log("resolveChoice: '" + result + "'");
    return result;
  }

  visitChoiceOld(ctx) { //save
    let choice = this.sequences[++this.indexer];
    if (!choice) {
      choice = new ChoiceState(this, ctx);
      if (choice.type) this.sequences[choice.id] = choice;
      //console.log('numSeqs:',Object.keys(this.sequences).length);
    }
  }

  visitSymbol(ctx) {

    let txs = ctx.transform();
    let result = ctx.getText();
    let tn = ctx.SYM();

    // handle transform on empty string    
    if (!tn) return this.applyTransforms('', txs) || result;

    let ident = symbolName(tn.getText());

    // if the symbol is pending just return it
    if (this.pendingSymbols.includes(ident)) {
      this.trace && console.log("IGNORE PENDING Symbol: \"\" tfs="
        + this.flatten(txs) + " -> " + result);
      return result;
    }

    this.trace && console.log("visitSymbol: $" + ident
      + " tfs=" + this.flatten(txs));

    // now try to resolve from context
    let resolved = this.context[ident];

    // if it fails, give up / wait for next pass
    if (!resolved) {
      this.trace && console.log("resolveSymbol[1]: '" + ident + "' -> '" + result + "'");
      return result;
    }

    // now check for transforms
    if (!txs.length) {
      this.trace && console.log("resolveSymbol[2]: '" + ident + "' -> '" + resolved + "'");
      return resolved;
    }

    let applied = this.applyTransforms(resolved, txs);
    result = applied || (resolved + this.flatten(txs));

    this.trace && console.log("resolveSymbol[3]: '" + ident + "' -> '" + result + "'");

    return result; // TODO: handle RiTa.* functions?
  }

  ////////////////////// ///////////// //////////////////////////

  visitAssign(ctx) {
    // visit value and create a mapping in the symbol table */
    let token = ctx.expr();
    let id = symbolName(ctx.symbol().getText());
    this.trace && console.log('visitAssign: $'
      + id + '=\'' + this.flatten(token) + "'");
    let result = this.visit(token);
    this.context[id] = result;
    this.trace && console.log("resolveAssign: $"
      + id + " -> '" + result + "' " + JSON.stringify(this.context));
    return ''; // no output on vanilla assign
  }

  visitExpr(ctx) {
    if (this.trace) {
      console.log("visitExpr: '" + ctx.getText() + "'");
      this.printChildren(ctx);
    }
    return this.visitChildren(ctx);
  }

  visitChars(ctx) {
    if (this.trace) console.log("visitChars: '" + ctx.getText() + "'");
    return ctx.getText();
  }

  visitCexpr(ctx) {
    let conds = ctx.cond();
    this.trace && console.log('visitCexpr:' + ctx.expr().getText() + "'",
      'cond={' + conds.map(c => c.getText().replace(',', '')) + '}');
    for (let i = 0; i < conds.length; i++) {
      let id = symbolName(conds[i].SYM().getText());
      let op = Operator.fromString(conds[i].op().getText());
      let val = conds[i].chars().getText();
      let sym = this.context[id];
      let accept = sym ? op.invoke(sym, val) : false;
      /* this.trace && console.log('  cond(' + ctx.getText() + ')',
        id, op.toString(), val, '->', accept); */
      if (!accept) return this.visitExpr(Visitor.EMPTY);
    }
    return this.visitExpr(ctx.expr());
  }

  visitCond(ctx) {
    if (this.trace) console.log("visitCond: '" + ctx.getText() + "'\t" + stack(ctx));
    return this.visitChildren(ctx);
  }

  visitWeight(ctx) {
    if (this.trace) console.log("visitWeight: '" + ctx.getText() + "'\t" + stack(ctx));
    return this.visitChildren(ctx);
  }

  visitWexpr(ctx) {
    if (this.trace) console.log("visitWexpr: '" + ctx.getText() + "'\t" + stack(ctx));
    return this.visitChildren(ctx);
  }

  visitOp(ctx) {
    if (this.trace) console.log("visitOp: '" + ctx.getText() + "'\t" + stack(ctx));
    return this.visitChildren(ctx);
  }

  visitTerminal(tn) {
    let text = tn.getText();
    if (text === '\n') return " "; // why do we need this?
    if (text !== Visitor.EOF && this.trace) console.log("visitTerminal: '" + text + "'");
    return null;
  }

  visitTransform(ctx) { // should never happen
    throw Error("[ERROR] visitTransform: '" + ctx.getText() + "'");
  }

  //////////////////////////////////////////////////////
  applyTransforms(term, tfs) {
    if (!term || !tfs || !tfs.length) return null;
    if (tfs.length > 1) throw Error("Invalid # Transforms: " + tfs.length);

    let result = term;

    // make sure it is resolved
    if (typeof term === 'string') {
      result = this.parent.normalize(term);
      if (this.parent.isParseable(result)) { // save for later
        //throw Error("applyTransforms.isParseable=true: '" + result + "'");
        return null;
      }
    }

    // NOTE: even multiple transforms show up as a single one here [TODO]
    let tf = tfs[0];
    if (!tf) throw Error("Null Transform: " + this.flatten(tfs));

    // split the string and apply each transform
    let transforms = tf.getText().replace(/^\./g, "").split("\.");
    for (let i = 0; i < transforms.length; i++) {
      result = this.applyTransform(result, transforms[i]);
    }

    return result;
  }

  // Attempts to apply transform, returns null on failure
  applyTransform(target, tx) {

    let result = null;

    if (this.trace) console.log("applyTransform: '" + target + "' tf=" + tx, typeof target[tx]);

    // check for function
    if (tx.endsWith(Visitor.FUNCTION)) {

      // strip parens
      tx = tx.substring(0, tx.length - 2);

      // function in context
      if (typeof this.context[tx] === 'function') {
        result = this.context[tx](target);
      }
      // built-in string functions
      else if (typeof target[tx] === 'function') {
        result = target[tx]();
      }
    }
    // check for property
    else {
      result = term[tx];
    }

    if (this.trace) console.log("resolveTransform: '"
      + target + "' -> '" + result + "'");

    return result;
  }


  /* run the transforms and return the results */
  /*   handleTransforms(obj, transforms) {
      let term = obj;
      if (transforms && transforms.length) {
        let tfs = this.trace ? '' : null; // debug
        for (let i = 0; i < transforms.length; i++) {
          let txf = transforms[i];
          txf = (typeof txf === 'string') ? txf : txf.getText();
          this.trace && (tfs += txf); // debug
          let comps = txf.split('.');
          for (let j = 1; j < comps.length; j++) {
            let comp = comps[j];
            if (comp.length) {
              if (comp.endsWith(Visitor.FUNCTION)) {
                // strip parens
                comp = comp.substring(0, comp.length - 2);
                // handle transforms in context
                if (typeof this.context[comp] === 'function') {
                  term = this.context[comp](term);
                }
                // handle built-in string functions
                else if (typeof term[comp] === 'function') {
                  term = term[comp]();
                }
                else {
                  let msg = 'Expecting ' + term + '.' + comp + '() to be a function';
                  if (!this.silent && !RiTa.SILENT) console.warn('[WARN] ' + msg);
                  //throw Error(msg);
                  term = term + '.' + comp;  // no-op
                }
                // handle object properties
              } else if (term.hasOwnProperty(comp)) {
                if (typeof term[comp] === 'function') {
                  throw Error('Functions with args not yet supported: $object.' + comp + '(...)');
                }
                term = term[comp];
                // no-op
              } else {
                term = term + '.' + comp; // no-op
              }
            }
          }
        }
        this.trace && console.log('handleTransforms: ' +
          (obj.length ? obj : "''") + tfs + ' -> ' + term);
      }
      return term;
       */
  //}

  stack(rule) {
    let ruleNames = this.parent.parser.getRuleNames();
    let sb = "    [";
    while (rule) {
      // compute what follows who invoked this rule
      let ruleIndex = rule.getRuleIndex();
      if (ruleIndex < 0) {
        sb += "n/a";
      }
      else {
        sb += ruleNames[ruleIndex] + " <- ";
      }
      rule = rule.parent;
    }
    return sb.replace(/ <- $/, "]");
  }

  visitChildren(node) {
    let result = "";
    for (let i = 0; i < node.getChildCount(); i++) {
      let child = node.getChild(i);
      let visit = this.visit(child);
      result += visit || "";
    }
    return result;
  }

  // ---------------------- Helpers ---------------------------

  getRuleName(ctx) {
    return ctx.hasOwnProperty('symbol') ?
      this.parent.lexer.symbolicNames[ctx.symbol.type] :
      this.parent.parser.ruleNames[ctx.ruleIndex];
  }

  /*   countChildRules(ctx, ruleName) {
      let count = 0;
      for (let i = 0; i < ctx.getChildCount(); i++) {
        if (this.getRuleName(ctx.getChild(i)) === ruleName) count++;
      }
      return count;
    } */

  printChildren(ctx) {
    for (let i = 0; i < ctx.getChildCount(); i++) {
      let child = ctx.getChild(i);
      console.log("  child[" + i + "]: '" + child.getText() +
        "' [" + this.getRuleName(child) + "]");
    }
  }

  flatten(toks) {
    if (!toks) return "";
    if (!Array.isArray(toks)) toks = [toks.getText()];
    let s = toks.reduce((acc, t) => acc + "|" + t, "");
    return s.startsWith("|") ? s.substring(1) : s;
  }

  handleSequence(options, shuffle) {
    if (!this.sequence) {
      this.sequence = new Sequence(options, shuffle);
    }
    return this.sequence.next();
  }
  /* 
    handleEmptyChoices(ctx, options) {
      let ors = this.countChildRules(ctx, Visitor.OR);
      let exprs = this.countChildRules(ctx, "expr");
      let adds = (ors + 1) - exprs;
      for (let i = 0; i < adds; i++) {
        options.push(Visitor.EMPTY);
      }
    } */
}

class ChoiceState {

  constructor(parent, ctx) {

    this.type = 0
    this.index = 0;
    this.options = []
    this.id = parent.indexer;

    ctx.wexpr().map((w, k) => {
      let wctx = w.weight();
      let weight = wctx ? parseInt(wctx.INT()) : 1;
      let expr = w.expr() || Visitor.EMPTY;
      for (let i = 0; i < weight; i++) this.options.push(expr);
    });

    let txs = ctx.transform();
    if (txs.length) {
      let tf = txs[0].getText();
      TYPES.forEach(s => tf.includes('.' + s) && (this.type = s));
    }

    if (this.type === RSEQUENCE) this.options =
      RiTa.randomizer.randomOrdering(this.options);

    if (parent.trace) console.log('  new ChoiceState#' + this.id + '('
      + this.options.map(o => o.getText()) + "," + this.type + ")");
  }

  select() {
    if (this.options.length == 0) return null;
    if (this.options.length == 1) return this.options[0];
    if (this.type == SEQUENCE) return this.selectSequence();
    if (this.type == NOREPEAT) return this.selectNoRepeat();
    if (this.type == RSEQUENCE) return this.selectRandSequence();
    return RiTa.randomizer.randomItem(this.options); // SIMPLE
  }

  selectNoRepeat() {
    let cand = this.last;
    do {
      cand = RiTa.randomizer.randomItem(this.options);
    } while (cand == this.last);
    this.last = cand;
    //console.log('selectNoRepeat',cand.getText());
    return this.last;
  }

  selectSequence() {
    //console.log('selectSequence');
    let idx = this.index++ % this.options.length;
    //console.log('IDX', idx);
    return (this.last = this.options[idx]); d
  }


  selectRandSequence() {
    //console.log('selectRandSequence', this.index);

    while (this.index == this.options.length) {
      this.options = RiTa.randomizer.randomOrdering(this.options);
      //console.log('rand: ', this.options);
      // make sure we are not repeating
      if (this.options[0] != this.last) this.index = 0;
    }
    return this.selectSequence();
  }
}

class NoRepeat {
  //TODO:
}

class Sequence {
  constructor(opts, shuffle) {
    this.last = null;
    this.index = 0;
    this.options = opts;
    this.shuffle = shuffle;
    if (shuffle) this.shuffleOpts();
    /*console.log('new Sequence(' + this.options.map
      (o => o.getText()) + ", " + !!shuffle + ")");*/
  }
  next() {
    //console.log('Sequence#' + this.index);
    while (this.shuffle && this.index === this.options.length) {
      this.shuffleOpts();
      // no repeats
      if (this.options.length < 2 || this.options[0] !== this.last) {
        this.index = 0;
      }
    }
    this.last = this.options[this.index++ % this.options.length];
    return this.last;
  }
  shuffleOpts() {
    let newArray = this.options.slice(), len = newArray.length, i = len;
    while (i--) {
      let p = parseInt(Math.random() * len), t = newArray[i];
      newArray[i] = newArray[p];
      newArray[p] = t;
    }
    this.options = newArray;
  }
}

function symbolName(text) {
  return (text.length && text[0] === Visitor.SYM) ? text.substring(1) : text;
}

/*
function randomElement(arr) {
  return arr[Math.floor((Math.random() * arr.length))];
}

function mergeArrays(orig, adds) {
  return (adds && adds.length) ? (orig || []).concat(adds) : orig;
}

function inspect(o) {
  let props = [];
  let obj = o;
  do {
    props = props.concat(Object.getOwnPropertyNames(obj));
  } while (obj = Object.getPrototypeOf(obj));
  return props.sort().filter(function (e, i, arr) {
    return (e != arr[i + 1]);// && typeof o[e] === 'function');
  });
}

function typeOf(o) {
  if (typeof o !== 'object') return typeof o;
  return Array.isArray(o) ? 'array' : 'object';
} 
 
function emptyExpr() {
  delete EmptyExpr.transforms;
  return EmptyExpr;
} 

const EmptyExpr = new RiScriptParser.ExprContext();
*/

Visitor.LP = '(';
Visitor.RP = ')';
Visitor.OR = 'OR';
Visitor.SYM = '$';
Visitor.EOF = '<EOF>';
Visitor.ASSIGN = '[]';
Visitor.FUNCTION = '()';
Visitor.EMPTY = new RiScriptParser.ExprContext();

const RSEQUENCE = 'rseq', SEQUENCE = 'seq', NOREPEAT = 'norep';
const TYPES = [RSEQUENCE, SEQUENCE, NOREPEAT];

module.exports = Visitor;
