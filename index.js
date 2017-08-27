const axios = require('axios');
const fs = require('fs');
const ApiKey = process.env.cta_api_key || require('./secret');
const ctaApiPrefix = 'http://www.ctabustracker.com/bustime/api/v2/';
const format = '&format=json';


function getRoutes() {
  const jsonArray = [];
  return axios.get(`${ctaApiPrefix}getroutes?key=${ApiKey}${format}`)
  .then(response => {
    return response.data['bustime-response'].routes;
  })
  .then(routes => {
    routes.forEach(route => {
      let routeName = route.rtnm.replace('/', ' ');
      jsonArray.push({
        value: route.rt,
        synonyms: [
          `route ${route.rt}`,
          routeName
        ]
      })
    });
    writeToFile(jsonArray, 'routes.json');
  })
  .catch(err => console.error(err));
};

function writeToFile(data, file) {
  const json = JSON.stringify(data, null, 2)
  fs.writeFile(file, json, 'utf8', (err) => {
    err ? console.error(err) : console.log('file written successfully');
  })
}

getRoutes();

