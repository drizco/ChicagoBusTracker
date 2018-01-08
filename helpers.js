const axios = require('axios');
const fs = require('fs');
const geolib = require('geolib');
const _ = require('lodash');
const ApiKey = require('./config/secret').cta;
const clientAccess = require('./config/secret').clientAccess;
const ctaApiPrefix = 'http://www.ctabustracker.com/bustime/api/v2/';
const format = '&format=json';
const damen = require('./data/50_damen');
const allRoutes = require('./data/allRoutes');
const routeMap = require('./data/routesWithKeywords');
const stopIdMemo = require('./data/stopIdMemo');
const routesWithKeywords_2 = require('./data/routesWithKeywords_2');
const stopsWithCoords = require('./data/stopsWithCoords');
const routeObjWithCoords = require('./data/routeObjWithCoords');
const coordHash = require('./data/coordHash');
const main = require('./index');

function writeToFile(data, file) {
  const json = JSON.stringify(data, null, 2)
  fs.writeFile(file, json, 'utf8', (err) => {
    err ? console.error(err) : console.log('file written successfully');
  })
}
function writeToFileCsv(data, file) {
  const csv = data.map(obj => '"' + obj.value + '"').join('\n')
  fs.writeFile(file, csv, 'utf8', (err) => {
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
  let stopsObj = {};
  const stopsArray = [];
  Object.keys(routes).forEach(route => {
    Object.keys(routes[route]).forEach(direction => {
      let path = `${ctaApiPrefix}getstops?key=${ApiKey}&rt=${route}&dir=${direction}${format}`;
      promiseArray.push(
        axios.get(path)
          .then(res => res.data['bustime-response'].stops)
          .then(stops => {
            routes[route][direction] = stops.map(stop => {
              return {
                name: stop.stpnm,
                id: stop.stpid,
                lat: stop.lat,
                lon: stop.lon
              }
            })
            // stops.forEach(stop => {
            //   stopsObj[stop.stpid] = stop.stpnm.replaceFunc();
            //   console.log(stop.stpnm.replaceFunc())
            //   stopsArray.push({
            //     name: stop.stpnm.replaceFunc(),
            //     id: stop.stpid,
            //     lat: stop.lat,
            //     lon: stop.lon
            //   })
            // })
            // return stops;
          })
          .catch(error => console.log(error))
      )
    })
  })
  return Promise.all(promiseArray)
    .then(() => {
      // writeToFile(stopsObj, 'stops.json');
      // writeToFile(stopsArray, 'stopsWithCoords.json')
      writeToFile(routes, 'routeObjWithCoords.json')
    })
    .catch(error => console.log(error))
}

// getRoutes().then(routes => getDirections(routes).then(routesWithDir => getStops(routesWithDir)))


function getArrivals(stopId, route) {
  return axios.get(`${ctaApiPrefix}getpredictions?key=${ApiKey}&rt=${route}&stpid=${stopId}${format}`)
    .then(res => res.data['bustime-response'])
    .then(predictions => {
      // console.log('predictions', predictions)
      // const arrivals = pred
      return predictions;
    })
    .catch(err => console.error(err))
}

function sendUpdate(response, sessionId) {
  const url = "https://api.dialogflow.com/api/query?v=20150910";
  const data = {
    followupEvent: {
      name: 'get_update',
      data: {
        response
      }
    },
    timezone: 'America/Chicago',
    lang: 'en',
    sessionId
  };
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${clientAccess}`
    }
  }
  axios.post(url, data, config)
    .then(response => console.log('response', response.data, response.data.result.contexts))
    .catch(error => console.log(error))
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
            response = main.formatText(arrivals, route, stopName)
            console.log(response + '\n^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^')
            // return response;
            return arrivals;
          })
      )
    })
  })
  console.log('finished looping')
  return Promise.all(promArr)
    .then(predictions => {
      console.log('are we in here', predictions)
      writeToFile(predictions, 'sampleArrivalResponses.json')
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
    .replaceAll('.', '')
}

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
      })
    })
  })
  writeToFile(stopObj, 'data/stops.json')
}

function mapKeywords(allRoutes) {
  const routesWithKeywords = {};
  const memo = {};
  const keywordValues = [];
  const stopIdMemo = {};
  for (let route in allRoutes) {
    if (allRoutes.hasOwnProperty(route)) {
      routesWithKeywords[route.toLowerCase()] = {};
      for (let direction in allRoutes[route]) {
        if (allRoutes[route].hasOwnProperty(direction)) {
          routesWithKeywords[route.toLowerCase()][direction.toLowerCase()] = {};
          for (let stopId in allRoutes[route][direction]) {
            if (allRoutes[route][direction].hasOwnProperty(stopId)) {
              console.log(allRoutes[route][direction][stopId.toLowerCase()])
              stopIdMemo[stopId] = false;
              let stopName = allRoutes[route][direction][stopId.toLowerCase()];
              let keywords = stopName
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
                  routesWithKeywords[route.toLowerCase()][direction.toLowerCase()][word.toLowerCase()] = [stopId]
                }
              })
            }
          }
          for (let keyword in routesWithKeywords[route.toLowerCase()][direction.toLowerCase()]) {
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
                })
              }
            }
          }
        }
      }
    }
  }
  console.log('$$$$$$', keywordValues.length)
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
  })
  Object.keys(stopIdMemo).forEach(stopId => {
    if (stopIdMemo[stopId]) {
      console.log('stopId', stopId)
    } else {
      console.log('ok', stopId)
    }
  })
  console.log('finished')
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

      })
    })
  })
  writeToFile(routes, 'allRoutesLowerCase.json')
}

function createCoordHash(stops) {
  const latHash = {};
  const lonHash = {};
  let latMax = 0;
  let lonMax = 0;
  let highestLat = 0;
  let lowestLat = 0;
  let highestLon = 0;
  let lowestLon = 0;
  stops.forEach(stop => {
    // const newLat = stop.lat;
    // const newLon = stop.lon;
    const newLat = stop.lat.toFixed(4);
    const newLon = stop.lon.toFixed(4);
    if (latHash[newLat]) {
      latHash[newLat].push(stop);
    } else {
      latHash[newLat] = [stop];
    }
    if (lonHash[newLon]) {
      lonHash[newLon].push(stop);
    } else {
      lonHash[newLon] = [stop];
    }

    if (latHash[newLat].length > latMax) {
      latMax = latHash[newLat].length;
    }
    if (lonHash[newLon].length > lonMax) {
      lonMax = lonHash[newLon].length;
    }
    if (stop.lat > highestLat) {
      highestLat = stop.lat;
    }
    if (stop.lat < lowestLat || lowestLat === 0) {
      lowestLat = stop.lat;
    }
    if (stop.lon < highestLon) {
      highestLon = stop.lon;
    }
    if (stop.lon > lowestLon || lowestLon === 0) {
      lowestLon = stop.lon;
    }
  })
  const latAvg = Object.keys(latHash).map(k => latHash[k]).reduce((acc, curr) => {
    return acc + curr.length;
  }, 0) / Object.keys(latHash).length;
  const lonAvg = Object.keys(lonHash).map(k => lonHash[k]).reduce((acc, curr) => {
    return acc + curr.length;
  }, 0) / Object.keys(lonHash).length;
  console.log('latHash size', Object.keys(latHash).length)
  console.log('lonHash size', Object.keys(lonHash).length)
  console.log('latMax', latMax)
  console.log('lonMax', lonMax)
  console.log('latAvg', latAvg)
  console.log('lonAvg', lonAvg)
  console.log('highestLat', highestLat)
  console.log('lowestLat', lowestLat)
  console.log('highestLon', highestLon)
  console.log('lowestLon', lowestLon)
  writeToFile({
    latHash,
    lonHash
  }, 'coordHash.json')
}

// createCoordHash(stopsWithCoords);

function getClosestStop(location, route, direction) {
  const stops = routeObjWithCoords[route][direction];
  const closest = [];
  const data = {};
  for (let i = 0; i < stops.length; i++) {
    const dist = geolib.getDistance(location.coordinates, {
      latitude: stops[i].lat,
      longitude: stops[i].lon
    });
    if (dist < 250) {
      const stopWithDist = Object.assign({}, stops[i], { dist: dist });
      closest.push(stopWithDist);
    }
  }
  closest.sort((a, b) => a.dist - b.dist);
  data.stopFound = closest.length > 0;
  data.stop = closest[0];
  return data;
}

// function getClosestStops(location) {
//   const closestStops = stopsWithCoords.reduce((acc, curr) => {
//     console.log(acc)
//     const dist = geolib.getDistance(location.coordinates, {
//       latitude: curr.lat,
//       longitude: curr.lon
//     });
//     if (dist < 250) {
//       curr.dist = dist;
//       acc.push(curr);
//     }
//     return acc;
//   }, [])
//   console.log('closest', closestStops.sort((a, b) => a.dist - b.dist));
// let response = '';
// const latKey = location.coordinates.latitude.toFixed(3);
// const lonKey = location.coordinates.longitude.toFixed(3);
// const city = location.city;
// if (!coordHash.latHash[latKey] || !coordHash.lonHash[lonKey]) {
//   response = `Sorry, Track My Bus doesn't work in ${city}. It presently only works in Chicago.`
// } else {
//   const latArr = coordHash.latHash[latKey];
//   const lonArr = coordHash.lonHash[lonKey];
//   const allStops = _.uniqBy(latArr.concat(lonArr), 'id').sort((a, b) => {
//     const aDist = geolib.getDistance(location.coordinates, {
//       latitude: a.lat,
//       longitude: a.lon
//     })
//     const bDist = geolib.getDistance(location.coordinates, {
//       latitude: b.lat,
//       longitude: b.lon
//     })
//     return aDist - bDist;
//   })

//   console.log('allStops', allStops, allStops.length);
// }
// console.log('response', response)
// }

// getClosestStops({
//   city: 'Chicago',
//   coordinates: {
//     latitude: 41.9196117,
//     longitude: -87.67659189999999
//   }
// })

module.exports = {
  writeToFile,
  writeToFileCsv,
  getRoutes,
  getDirections,
  getStops,
  mapKeywords,
  getArrivals,
  sendUpdate,
  getClosestStop
}