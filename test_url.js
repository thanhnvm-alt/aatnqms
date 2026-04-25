const rawConnectionString = 'postgresql://edbqaqc:Oe71zNGcnaS6hzra@dbtracking.apps.zuehjcybfdjyc7j.aacorporation.vn:5432/aaTrackingApps?sslmode=require';
let connectionString = rawConnectionString;
try {
  const url = new URL(rawConnectionString);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('ssl');
  connectionString = url.toString();
} catch (e) {
  console.warn('Could not parse DATABASE_URL as URL, using raw string');
}
console.log(connectionString);
