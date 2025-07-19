import { v4 as uuidv4 } from 'uuid';

// Generate unique session ID
export function generateSessionId() {
  return uuidv4();
}

// Clean SQL response by removing markdown and ensuring proper formatting
export function cleanSQLResponse(sqlResponse) {
  // Remove markdown code blocks
  let cleaned = sqlResponse.replace(/```sql\s*/g, '').replace(/```\s*$/g, '');
  cleaned = cleaned.replace(/```\s*/g, '').replace(/```\s*$/g, '');
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // Fix common PostgreSQL issues
  cleaned = cleaned
    // Fix YEAR() function calls
    .replace(/YEAR\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(YEAR FROM $1)')
    // Fix MONTH() function calls
    .replace(/MONTH\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(MONTH FROM $1)')
    // Fix DAY() function calls
    .replace(/DAY\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(DAY FROM $1)')
    // Fix backticks to double quotes
    .replace(/`([^`]+)`/g, '"$1"')
    // Fix NOW() to CURRENT_TIMESTAMP
    .replace(/NOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
    // Fix unterminated quotes - remove any single quotes that are unmatched
    .replace(/'([^']*)$/g, "'$1'")
    // Fix double quotes that might be unmatched
    .replace(/"([^"]*)$/g, '"$1"')
    // Remove any trailing quotes without content
    .replace(/['"]\s*$/g, '')
    // Fix multiple semicolons
    .replace(/;+/g, ';')
    // Remove any SQL that's just whitespace or empty
    .replace(/^\s*SELECT\s*$/i, 'SELECT 1')
    // Fix any malformed SQL that ends with just a semicolon
    .replace(/^\s*;\s*$/, 'SELECT 1;');
  
  // Ensure it ends with exactly one semicolon
  cleaned = cleaned.replace(/;+$/, ''); // Remove any trailing semicolons
  cleaned += ';'; // Add exactly one semicolon
  
  return cleaned;
}

// Convert Decimal objects to floats for JSON serialization
export function convertDecimalsToFloats(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'boolean') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertDecimalsToFloats(item));
  }
  
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Decimal') {
        result[key] = parseFloat(value.toString());
      } else {
        result[key] = convertDecimalsToFloats(value);
      }
    }
    return result;
  }
  
  return obj;
}

// Log database connection attempts
export function logDbConnectionAttempt({ host, port, database, user }) {
  console.log('[DB CONNECT ATTEMPT]', { host, port, database, user });
}

// Safely convert dates to ISO strings
export function safeDateToISO(date) {
  if (date instanceof Date) {
    return date.toISOString();
  } else if (typeof date !== 'string') {
    return new Date().toISOString();
  }
  return date;
}

// Validate SQL query for common issues
export function validateSQL(sql) {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, error: 'SQL query is empty or invalid' };
  }
  
  const trimmed = sql.trim();
  
  // Check for empty or whitespace-only SQL
  if (!trimmed || trimmed === ';') {
    return { valid: false, error: 'SQL query is empty' };
  }
  
  // Check for unterminated quotes
  const singleQuotes = (trimmed.match(/'/g) || []).length;
  const doubleQuotes = (trimmed.match(/"/g) || []).length;
  
  if (singleQuotes % 2 !== 0) {
    return { valid: false, error: 'Unterminated single quotes' };
  }
  
  if (doubleQuotes % 2 !== 0) {
    return { valid: false, error: 'Unterminated double quotes' };
  }
  
  // Check for basic SQL structure
  if (!trimmed.toUpperCase().includes('SELECT')) {
    return { valid: false, error: 'SQL must start with SELECT' };
  }
  
  return { valid: true };
} 