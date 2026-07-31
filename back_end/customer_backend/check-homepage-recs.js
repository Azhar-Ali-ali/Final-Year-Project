const http = require('http');

const userId = '6418192c-4e6a-482b-abeb-a966ee317f3e';
const url = `http://localhost:5000/api/homepage?sectionLimit=8&flashDealLimit=8&userId=${userId}`;

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const payload = JSON.parse(data);
      const rows = payload?.data?.productRows || [];
      console.log(JSON.stringify({
        rowIds: rows.map(row => row.id),
        rowTitles: rows.map(row => row.title),
        recommendedRow: rows.find(row => row.id === 'recommended-for-you') || null
      }, null, 2));
    } catch (err) {
      console.error('PARSE_ERROR', err.message);
      console.log(data);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('REQUEST_ERROR', err.message);
  process.exit(1);
});
