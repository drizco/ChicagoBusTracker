const routeMap = require('./data/routesWithKeywords_4');
const allRoutesLowerCase = require('./data/allRoutesLowerCase');
const helpers = require('./helpers');

exports.getArrivals = function getArrivals(req, res) {
  let response = "This is a sample response from your webhook!"
  const { route, stops, direction } = req.body.result.parameters;
  const stopIds = getStopId(route, stops, direction);
  switch (stopIds.length) {
    case 0:
      response = 'I couldn\'t find your stop';
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        "speech": response, "displayText": response
      }));
      break;
    case 1:
      const stopId = stopIds[0];
      const stopName = allRoutesLowerCase[route][direction][stopId];
      helpers.getArrivals(stopId, route)
        .then(arrivals => {
          console.log('arrivals', arrivals, stopId, route)
          response = formatText(arrivals, route, stopName)
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify({
            "speech": response, "displayText": response
          }));
        })
      break;
    default:
      response = 'Which stop? ' + stopIds.map(id => {
        return allRoutesLowerCase[route][direction][id]
      }).join(' or ');
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        "speech": response, "displayText": response
      }));
  }
};

function getStopId(route, stopKeywords, direction) {
  const stopIds = stopKeywords.map(keyword => {
    const stopId = routeMap[route][direction][keyword];
    return stopId ? stopId : null;
  }).filter((id, index, self) => {
    return self.indexOf(id) === index && id !== null;
  })
  return stopIds;
}

function formatText(arrivals, route, stopName) {
  let response;
  const formatWithMinutes = function (arrival) {
    return arrival === '1' ? `${arrival} minute` : `${arrival} minutes`;
  }
  if (arrivals.error) {
    const bool = arrivals.error.msg === 'No arrival times';
    return bool ?
      `there are no upcoming arrivals for route ${route}`
      :
      `there is no scheduled service for route ${route}`;
  } else {
    const due = arrivals.prd[0].prdctdn.toLowerCase() === 'due';
    if (due) {
      response = `hurry! a bus is due to arrive any second at ${stopName}. `
    }
    switch (arrivals.prd.length) {

      case 1:
        if (!due) {
          response = `a bus is coming in ${formatWithMinutes(arrivals.prd[0].prdctdn)} to ${stopName}. `
        }
        response += `it's the last one coming for a while`;
        return response;

      case 2:
        if (!due) {
          response = `buses are arriving in ${formatWithMinutes(arrivals.prd[0].prdctdn)} and ${formatWithMinutes(arrivals.prd[1].prdctdn)} to ${stopName}.`
        } else {
          response += `the next one is arriving in ${formatWithMinutes(arrivals.prd[1].prdctdn)} to ${stopName}.`;
        }

      default:
        if (!due) {
          const minuteSeq = arrivals.prd.map((prediction, i) => {
            if (i === arrivals.prd.length - 1) {
              return 'and ' + formatWithMinutes(prediction.prdctdn);
            }
            return prediction.prdctdn;
          }).join(', ');
          response = `buses are arriving in ${minuteSeq} to ${stopName}`
        } else {
          for (let i = 1; i < arrivals.prd.length; i++) {
            if (arrivals.prd[i].prdctdn.toLowerCase() === 'due') {
              response += 'the next one is due too';
            } else {

              if (i !== arrivals.prd.length - 1) {
                response += arrivals.prd[i].prdctdn + ', ';
              } else {
                response += `and ${formatWithMinutes(arrivals.prd[i].prdctdn)} to ${stopName}.`
              }
            }
          }
        }
        return response
    }
  }
}
