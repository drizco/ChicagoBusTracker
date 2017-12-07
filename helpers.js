const axios = require('axios');
const fs = require('fs');
const ApiKey = process.env.cta_api_key || require('./config/secret');

const ctaApiPrefix = 'http://www.ctabustracker.com/bustime/api/v2/';
const format = '&format=json';
const damen = require('./data/50_damen');
const allRoutes = require('./data/allRoutes');
const routeMap = require('./data/routesWithKeywords');
const stopIdMemo = require('./data/stopIdMemo');
const routesWithKeywords_2 = require('./data/routesWithKeywords_2');
const main = require('./index');

function writeToFile(data, file) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFile(file, json, 'utf8', err => {
    err ? console.error(err) : console.log('file written successfully');
  });
}
function writeToFileCsv(data, file) {
  const csv = data.map(obj => `"${obj.value}"`).join('\n');
  fs.writeFile(file, csv, 'utf8', err => {
    err ? console.error(err) : console.log('file written successfully');
  });
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
}

function getDirections(routes) {
  const routesWithDir = [];
  return Promise.all(Object.keys(routes).map(route => axios.get(`${ctaApiPrefix}getdirections?key=${ApiKey}&rt=${route}${format}`)
    .then(res => res.data['bustime-response'].directions)
    .then(directions => {
      directions.forEach(direction => {
        routes[route][direction.dir] = {};
      });
    })
    .catch(error => console.error(error))))
    .then(() => routes);
}

function getStops(routes) {
  const promiseArray = [];
  const stopsObj = {};
  Object.keys(routes).forEach(route => {
    Object.keys(routes[route]).forEach(direction => {
      const path = `${ctaApiPrefix}getstops?key=${ApiKey}&rt=${route}&dir=${direction}${format}`;
      promiseArray.push(
        axios.get(path)
          .then(res => res.data['bustime-response'].stops)
          .then(stops => {
            stops.forEach(stop => {
              stopsObj[stop.stpid] = stop.stpnm.replaceFunc();
              console.log(stop.stpnm.replaceFunc());
            });
            return null;
          })
          .catch(error => console.log(error))
      );
    });
  });
  return Promise.all(promiseArray)
    .then(() => {
      writeToFile(stopsObj, 'stops.json');
    })
    .catch(error => console.log(error));
}

function getArrivals(stopId, route) {
  return axios.get(`${ctaApiPrefix}getpredictions?key=${ApiKey}&rt=${route}&stpid=${stopId}${format}`)
    .then(res => res.data['bustime-response'])
    .then(predictions => 
      // console.log('predictions', predictions)
      // const arrivals = pred
       predictions
    )
    .catch(err => console.error(err));
}

function logSampleResponses(allRoutes) {
  const promArr = [];
  Object.keys(allRoutes).forEach(route => {
    Object.keys(allRoutes[route]).forEach(direction => {
      const stopId = Object.keys(allRoutes[route][direction])[0];
      const stopName = allRoutes[route][direction][stopId];
      promArr.push(
        getArrivals(stopId, route)
          .then(arrivals => {
            response = main.formatText(arrivals, route, stopName);
            console.log(`${response  }\n^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^`);
            // return response;
            return arrivals;
          })
      );
    });
  });
  console.log('finished looping');
  return Promise.all(promArr)
    .then(predictions => {
      console.log('are we in here', predictions);
      writeToFile(predictions, 'sampleArrivalResponses.json');
      // predictions.forEach(p => {
      // })
      return predictions;
    })
    .catch(err => console.log(err));
}

// logSampleResponses(allRoutes);

String.prototype.replaceFunc = function () {
  const target = this;
  return target
    .replaceAll('&', 'and')
    // .replaceAll('& ', '')
    .replaceAll('/', ' ')
    .replaceAll('HS', 'Highschool')
    .replaceAll('S ', 'South ')
    .replaceAll('S. ', 'South ')
    .replaceAll('S)', 'South ')
    .replaceAll('N ', 'North ')
    .replaceAll('N. ', 'North ')
    .replaceAll('N)', 'North ')
    .replaceAll('E ', 'East ')
    .replaceAll('E. ', 'East ')
    .replaceAll('E)', 'East ')
    .replaceAll('W ', 'West ')
    .replaceAll('w ', 'West ')
    .replaceAll('W. ', 'West ')
    .replaceAll('W)', 'West ')
    .replaceAll('Bldg.', 'Building')
    .replaceAll('Bldg', 'Building')
    .replaceAll('Blvd', 'Boulevard')
    .replaceAll('Dr ', 'Drive ')
    .replaceAll('Ave', 'Avenue')
    .replaceAll('Rd', 'Road')
    .replaceAll('Hwy', 'Highway')
    .replaceAll('Mt', 'Mount')
    .replaceAll('SB', 'southbound')
    .replaceAll('Pres ', 'Presbyterian ')
    .replaceAll('mid', '')
    .replaceAll('St.', 'Saint')
    .replaceAll('Prking Ent', 'Parking Entrance')
    .replaceAll('ST', '')
    .replaceAll('II', '')
    .replaceAll('(', '')
    .replaceAll(')', '')
    .replaceAll('-', ' ')
    .replaceAll('.', '');
};

String.prototype.replaceAll = function (search, replacement) {
  const target = this;
  return target.split(search).join(replacement);
};

function getStopsFromRouteFile(routes) {
  const stopObj = {};
  Object.keys(routes).forEach(route => {
    Object.keys(routes[route]).forEach(direction => {
      Object.keys(routes[route][direction]).forEach(stopID => {
        const name = routes[route][direction][stopID];
        const stopName = routes[route][direction][stopID].replaceFunc();
        stopObj[stopID] = stopName;
      });
    });
  });
  writeToFile(stopObj, 'data/stops.json');
}

function mapKeywords(allRoutes) {
  const routesWithKeywords = {};
  const memo = {};
  const keywordValues = [];
  const stopIdMemo = {};
  for (const route in allRoutes) {
    if (allRoutes.hasOwnProperty(route)) {
      routesWithKeywords[route.toLowerCase()] = {};
      for (const direction in allRoutes[route]) {
        if (allRoutes[route].hasOwnProperty(direction)) {
          routesWithKeywords[route.toLowerCase()][direction.toLowerCase()] = {};
          for (const stopId in allRoutes[route][direction]) {
            if (allRoutes[route][direction].hasOwnProperty(stopId)) {
              console.log(allRoutes[route][direction][stopId.toLowerCase()]);
              stopIdMemo[stopId] = false;
              const stopName = allRoutes[route][direction][stopId.toLowerCase()];
              const keywords = stopName
                .replaceAll('&', '')
                .replaceAll('& ', '')
                .replaceAll('/', ' ')
                .replaceAll('HS', 'Highschool')
                .replaceAll('S ', 'South ')
                .replaceAll('S. ', 'South ')
                .replaceAll('S)', 'South ')
                .replaceAll('N ', 'North ')
                .replaceAll('N. ', 'North ')
                .replaceAll('N)', 'North ')
                .replaceAll('E ', 'East ')
                .replaceAll('E. ', 'East ')
                .replaceAll('E)', 'East ')
                .replaceAll('W ', 'West ')
                .replaceAll('w ', 'West ')
                .replaceAll('W. ', 'West ')
                .replaceAll('W)', 'West ')
                .replaceAll('Bldg.', 'Building')
                .replaceAll('Bldg', 'Building')
                .replaceAll('Blvd', 'Boulevard')
                .replaceAll('Dr ', 'Drive ')
                .replaceAll('Ave', 'Avenue')
                .replaceAll('Rd', 'Road')
                .replaceAll('Hwy', 'Highway')
                .replaceAll('Mt', 'Mount')
                .replaceAll('SB', '')
                .replaceAll('Pres ', 'Presbyterian ')
                .replaceAll('mid', '')
                .replaceAll('St.', 'Saint')
                .replaceAll('Prking Ent', 'Parking Entrance')
                .replaceAll('ST', '')
                .replaceAll('II', '')
                .replaceAll('(', '')
                .replaceAll(')', '')
                .replaceAll('-', ' ')
                .replaceAll('.', '')
                .split(' ')
                .filter(word => word !== '');
              keywords.forEach(word => {
                if (routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][word.toLowerCase()]) {
                  routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][word.toLowerCase()].push(stopId);
                } else {
                  routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][word.toLowerCase()] = [stopId];
                }
              });
            }
          }
          for (const keyword in routesWithKeywords[route.toLowerCase()][direction.toLowerCase()]) {
            if (routesWithKeywords[route.toLowerCase()][direction.toLowerCase()].hasOwnProperty(keyword)) {
              if (routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][keyword].length > 1) {
                delete routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][keyword];
              } else {
                routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][keyword] = routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][keyword][0];
              }
              if (routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][keyword] && !memo[keyword]) {
                memo[keyword] = 1;
                keywordValues.push({
                  value: keyword,
                  synonyms: [keyword]
                });
              }
            }
          }
        }
      }
    }
  }
  console.log('$$$$$$', keywordValues.length);
  // writeToFile(routesWithKeywords, 'routesWithKeywords_4.json')
  // writeToFile(keywordValues, 'keywordValues_4.json')
}

function logMissingStops() {
  Object.keys(stopIdMemo).forEach(stopId => {
    const routeMap = routesWithKeywords_2;
    const routes = Object.keys(routeMap);
    for (let i = 0; i < routes.length; i++) {
      const directions = Object.keys(routeMap[routes[i]]);
      for (let j = 0; j < directions.length; j++) {
        const keywords = Object.keys(routeMap[routes[i]][directions[j]]);
        for (let k = 0; k < keywords.length; k++) {
          if (stopId === routeMap[routes[i]][directions[j]][keywords[k]]) {
            stopIdMemo[stopId] = true;
          }
        }
      }
    }
  });
  Object.keys(stopIdMemo).forEach(stopId => {
    if (stopIdMemo[stopId]) {
      console.log('stopId', stopId);
    } else {
      console.log('ok', stopId);
    }
  });
  console.log('finished');
}

function lowerCaseAllRoutes(allRoutes) {
  const routes = {};
  Object.keys(allRoutes).forEach(route => {
    routes[route.toLowerCase()] = {};
    Object.keys(allRoutes[route]).forEach(direction => {
      routes[route.toLowerCase()][direction.toLowerCase()] = {};
      Object.keys(allRoutes[route][direction]).forEach(stopId => {
        routes[route.toLowerCase()][direction.toLowerCase()][stopId.toLowerCase()] = allRoutes[route][direction][stopId]
          .replaceAll('&', 'and')
          .replaceAll('/', ' ')
          .replaceAll('HS', 'Highschool')
          .replaceAll('S ', 'South ')
          .replaceAll('S. ', 'South ')
          .replaceAll('S)', 'South ')
          .replaceAll('N ', 'North ')
          .replaceAll('N. ', 'North ')
          .replaceAll('N)', 'North ')
          .replaceAll('E ', 'East ')
          .replaceAll('E. ', 'East ')
          .replaceAll('E)', 'East ')
          .replaceAll('W ', 'West ')
          .replaceAll('w ', 'West ')
          .replaceAll('W. ', 'West ')
          .replaceAll('W)', 'West ')
          .replaceAll('Bldg.', 'Building')
          .replaceAll('Bldg', 'Building')
          .replaceAll('Blvd', 'Boulevard')
          .replaceAll('Dr ', 'Drive ')
          .replaceAll('Ave', 'Avenue')
          .replaceAll('Rd', 'Road')
          .replaceAll('Hwy', 'Highway')
          .replaceAll('Mt', 'Mount')
          .replaceAll('SB', '')
          .replaceAll('Pres ', 'Presbyterian ')
          .replaceAll('mid', '')
          .replaceAll('St ', 'street ')
          .replaceAll('St.', 'Saint')
          .replaceAll('Prking Ent', 'Parking Entrance')
          .replaceAll('ST', 'street')
          .replaceAll('II', 'the second')
          .replaceAll('(', '')
          .replaceAll(')', '')
          .replaceAll('-', ' ')
          .replaceAll('.', '')
          .toLowerCase();
      });
    });
  });
  writeToFile(routes, 'allRoutesLowerCase.json');
}

module.exports = {
  writeToFile,
  writeToFileCsv,
  getRoutes,
  getDirections,
  getStops,
  mapKeywords,
  getArrivals
};
