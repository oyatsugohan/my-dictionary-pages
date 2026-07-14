// 中身をこの2行だけに上書きしてください
const worker = { fetch: () => new Response("Not Found", { status: 404 }) };
export default worker;
