const url = "http://upos-sz-mirrorcos.bilivideo.com/upgcxcode/35/40/31105614035/31105614035-1-192.mp4?e=ig8euxZM2rNcNbRBhzdVhwdlhWUzhwdVhoNvNC8BqJIzNbfq9rVEuxTEnE8L5F6VnEsSTx0vkX8fqJeYTj_lta53NCM=&platform=html5&deadline=1773121377&gen=playurlv3&og=hw&oi=1385955528&trid=a5d46b899c784bfead92d69e9431accO&mid=0&nbs=1&os=estghw&uipk=5&upsig=b10f172d0ed98c03ef738503bca9b3f9&uparams=e,platform,deadline,gen,og,oi,trid,mid,nbs,os,uipk&bvc=vod&nettype=1&bw=1233176&buvid=&build=7330300&dl=0&f=O_0_0&agrr=0&orderid=0,3";
fetch(url, { headers: { 'Referer': 'https://www.bilibili.com' } }).then(res => {
  console.log("Status:", res.status);
  console.log("Content-Length:", res.headers.get("content-length"));
}).catch(console.error);
