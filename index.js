const routeMap = require('./data/routesWithKeywords');
const stopMap = require('./data/stops');
const helpers = require('./helpers');

exports.getArrivals = function getArrivals(req, res) {
  const response = "This is a sample response from your webhook!"
  const { route, stops, direction } = req.body.result.parameters;
  const stopID = getStopID(route, stops, direction);
  const stopName = stopMap[stopID];
  helpers.getArrivals(stopID, route)
    .then(arrivals => {
      const response = `route ${route} arriving at ${stopName} in ` + arrivals.join(' minutes, ')
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        "speech": response, "displayText": response
      }));
    })
};

function getStopID(route, stops, direction) {
  const mapObj = {};
  let count = 0;
  let stopIdToReturn;
  stops.forEach(stop => {
    let stopArr = routeMap[route][direction][stop]
    if (stopArr) {
      stopArr.forEach(stopID => {
        if (mapObj[stopID]) {
          mapObj[stopID]++;
        } else {
          mapObj[stopID] = 1;
        }
        if (mapObj[stopID] > count) {
          stopIdToReturn = stopID;
          count = mapObj[stopID];
        }
      })
    }
  })
  return stopIdToReturn;
}
