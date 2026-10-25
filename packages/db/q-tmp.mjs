import postgres from 'postgres';
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 1 });
console.log(JSON.stringify(await sql.unsafe(process.argv[2]), null, 0).replace(/\},\{/g, '},\n{'));
await sql.end();
