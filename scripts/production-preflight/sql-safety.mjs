const allowedStatementPatterns = [
  /^begin\s+read\s+only$/i,
  /^rollback$/i,
  /^set\s+local\s+(?:statement_timeout|lock_timeout)\s*=\s*$/i,
  /^show\s+(?:default_transaction_read_only|transaction_read_only)$/i,
  /^select\b[\s\S]*$/i,
  /^with\b[\s\S]*\bselect\b[\s\S]*$/i,
];

const forbiddenKeywords = [
  "insert", "update", "delete", "upsert", "merge", "create", "alter",
  "drop", "truncate", "grant", "revoke", "call", "copy",
];

export function maskSqlCommentsAndStrings(sql) {
  let output = "";
  let index = 0;
  let blockDepth = 0;
  let state = "code";
  let dollarTag = "";

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (state === "line_comment") {
      if (character === "\n") {
        state = "code";
        output += "\n";
      } else output += " ";
      index += 1;
      continue;
    }
    if (state === "block_comment") {
      if (character === "/" && next === "*") {
        blockDepth += 1;
        output += "  ";
        index += 2;
      } else if (character === "*" && next === "/") {
        blockDepth -= 1;
        output += "  ";
        index += 2;
        if (blockDepth === 0) state = "code";
      } else {
        output += character === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (state === "single_quote") {
      if (character === "'" && next === "'") {
        output += "  ";
        index += 2;
      } else {
        output += character === "\n" ? "\n" : " ";
        index += 1;
        if (character === "'") state = "code";
      }
      continue;
    }
    if (state === "double_quote") {
      if (character === '"' && next === '"') {
        output += "  ";
        index += 2;
      } else {
        output += character === "\n" ? "\n" : " ";
        index += 1;
        if (character === '"') state = "code";
      }
      continue;
    }
    if (state === "dollar_quote") {
      if (sql.startsWith(dollarTag, index)) {
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "code";
      } else {
        output += character === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (character === "-" && next === "-") {
      state = "line_comment";
      output += "  ";
      index += 2;
    } else if (character === "/" && next === "*") {
      state = "block_comment";
      blockDepth = 1;
      output += "  ";
      index += 2;
    } else if (character === "'") {
      state = "single_quote";
      output += " ";
      index += 1;
    } else if (character === '"') {
      state = "double_quote";
      output += " ";
      index += 1;
    } else if (character === "$") {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        state = "dollar_quote";
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length;
      } else {
        output += character;
        index += 1;
      }
    } else {
      output += character;
      index += 1;
    }
  }

  if (state !== "code" && state !== "line_comment") {
    throw new Error("SQL contains an unterminated comment or quoted value.");
  }
  return output;
}

export function assertReadOnlySql(sql) {
  const masked = maskSqlCommentsAndStrings(sql);
  if (/\\[A-Za-z!]/.test(masked)) {
    throw new Error("psql meta-commands are not permitted.");
  }

  for (const keyword of forbiddenKeywords) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(masked)) {
      throw new Error(`Forbidden SQL keyword detected: ${keyword}.`);
    }
  }

  const statements = masked
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (statements.length === 0) throw new Error("SQL batch is empty.");
  for (const statement of statements) {
    if (!allowedStatementPatterns.some((pattern) => pattern.test(statement))) {
      throw new Error(`SQL statement is not allowlisted: ${statement.slice(0, 80)}`);
    }
  }
  return statements;
}

export function assertReadOnlyBatch(sql) {
  const statements = assertReadOnlySql(sql);
  if (!/^begin\s+read\s+only$/i.test(statements[0])) {
    throw new Error("SQL batch must begin with BEGIN READ ONLY.");
  }
  if (!/^rollback$/i.test(statements.at(-1))) {
    throw new Error("SQL batch must end with ROLLBACK.");
  }
  if (!statements.some((statement) => /^set\s+local\s+statement_timeout/i.test(statement))) {
    throw new Error("SQL batch is missing statement_timeout.");
  }
  if (!statements.some((statement) => /^set\s+local\s+lock_timeout/i.test(statement))) {
    throw new Error("SQL batch is missing lock_timeout.");
  }
  return statements;
}
