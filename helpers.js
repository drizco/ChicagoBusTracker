const axios = require('axios');
const fs = require('fs');
const ApiKey = process.env.cta_api_key || require('./config/secret');

const ctaApiPrefix = 'http://www.ctabustracker.com/bustime/api/v2/';
const format = '&format=json';
const damen = require('./data/50_damen');
const allRoutes = require('./data/allRoutes');
const routeMap = require('./data/routesWithKeywords');

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

function getArrivals(stopID, route) {
  return axios.get(`${ctaApiPrefix}getpredictions?key=${ApiKey}&rt=${route}&stpid=${stopID}${format}`)
    .then(res => res.data['bustime-response'])
    .then(predictions =>
      // const arrivals = pred
      predictions
    )
    .catch(err => console.error(err));
}

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

// getStopsFromRouteFile(allRoutes);
function checkWord(word) {
  const badWords = {
    street: 1,
    avenue: 1,
    avenuenue: 1,
    boulevard: 1,
    drive: 1
  };
  if (badWords[word]) {
    return false;
  }
  return true;
}

function mapKeywords(allRoutes) {
  const routesWithKeywords = {};
  const memo = {};
  const keywordValues = [];
  for (const route in allRoutes) {
    if (allRoutes.hasOwnProperty(route)) {
      routesWithKeywords[route] = {};
      for (const direction in allRoutes[route]) {
        if (allRoutes[route].hasOwnProperty(direction)) {
          routesWithKeywords[route][direction] = {};
          for (const stopId in allRoutes[route][direction]) {
            if (allRoutes[route][direction].hasOwnProperty(stopId)) {
              console.log(allRoutes[route][direction][stopId]);
              const stopName = allRoutes[route][direction][stopId];
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
                if (checkWord(word.toLowerCase())) {
                  if (routesWithKeywords[route][direction][word]) {
                    routesWithKeywords[route][direction][word].push(stopId);
                  } else {
                    routesWithKeywords[route][direction][word] = [stopId];
                  }
                }
              });
            }
          }
          for (const keyword in routesWithKeywords[route][direction]) {
            if (routesWithKeywords[route][direction].hasOwnProperty(keyword)) {
              if (routesWithKeywords[route][direction][keyword].length > 20) {
                delete routesWithKeywords[route][direction][keyword];
              }
              if (routesWithKeywords[route][direction][keyword] && !memo[keyword]) {
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
  writeToFile(routesWithKeywords, 'routesWithKeywords.json');
  writeToFile(keywordValues, 'keywordValues.json');
  writeToFileCsv(keywordValues, 'keyValues.csv');
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
