const axios = require('axios');
const fs = require('fs');
const ApiKey = process.env.cta_api_key || require('./secret');
const ctaApiPrefix = 'http://www.ctabustracker.com/bustime/api/v2/';
const format = '&format=json';
const damen = require('./50_damen');

function writeToFile(data, file) {
  const json = JSON.stringify(data, null, 2)
  fs.writeFile(file, json, 'utf8', (err) => {
    err ? console.error(err) : console.log('file written successfully');
  })
}

function getRoutes() {
  const routeObj = {};
  return axios.get(`${ctaApiPrefix}getroutes?key=${ApiKey}${format}`)
  .then(res => res.data['bustime-response'].routes)
  .then(routes => {
    routes.forEach(route => {
      routeObj[route.rt] = {};
    });
    return routeObj;
  })
  .catch(err => console.error(err));
};

function getDirections(routes) {
  const routesWithDir = [];
  return Promise.all(Object.keys(routes).map(route => {
    return axios.get(`${ctaApiPrefix}getdirections?key=${ApiKey}&rt=${route}${format}`)
    .then(res => res.data['bustime-response'].directions)
    .then(directions => {
      directions.forEach(direction => {
        routes[route][direction.dir] = {}
      })
    })
    .catch(error => console.error(error))
  }))
  .then(() => {
    return routes;
  })
}

function getStops(routes) {
  const promiseArray = [];
  let routeObj = {};
  Object.keys(routes).forEach(route => {
    Object.keys(routes[route]).forEach(direction => {
      let path = `${ctaApiPrefix}getstops?key=${ApiKey}&rt=${route}&dir=${direction}${format}`;
      promiseArray.push(
        axios.get(path)
        .then(res => res.data['bustime-response'].stops)
        .then(stops => {
          stops.forEach(stop => {
            routes[route][direction][stop.stpid] = stop.stpnm;
          })
        })
        .catch(error => console.log(error))
      )
    })
  })
  return Promise.all(promiseArray)
  .then(() => {
    writeToFile(routes, 'allRoutes.json')
  })
  .catch(error => console.log(error))
}

getRoutes()
.then(routes => getDirections(routes))
.then(routesWithDir => getStops(routesWithDir))

// function getDamen() {
//   const directions = ['Northbound', 'Southbound'];
//   const promiseArray = [];
//   directions.forEach(direction => {
//     let path = `${ctaApiPrefix}getstops?key=${ApiKey}&rt=50&dir=${direction}${format}`;
//     promiseArray.push(
//       axios.get(path)
//       .then(res => res.data['bustime-response'].stops)
//       .catch(err => console.error(err))
//     )
//   })
//   return Promise.all(promiseArray)
//   .then(stopsArr => {
//     console.log('stops', stopsArr)
//     const json = {
//       northbound: stopsArr[0],
//       southbound: stopsArr[1]
//     }
//     writeToFile(json, '50_damen.json');
//   })
//   .catch(err => console.error(err));
// }

// getDamen();

// function mapKeywords(route, direction, file) {
//   const map = {};
//   route[direction].forEach(stop => {
//     let name = stop.stpnm;
//     name = name.replace('/', ' ');
//     name.split(' ').forEach(word => {
//       if (map[word]) {
//         map[word].push(stop.stpid);
//       } else {
//         map[word] = [stop.stpid];
//       }
//     })
//   })
//   writeToFile(map, file);
// }

// mapKeywords(damen, 'northbound', 'damenNorthKeywords.json');

