const routeMap = require('./data/routesWithKeywords_4');
const allRoutesLowerCase = require('./data/allRoutesLowerCase');
const helpers = require('./helpers');
const moment = require('moment');

// deployment command
// gcloud beta functions deploy dialogflowFirebaseFulfillment --stage-bucket chicagobustracker --trigger-http

exports.dialogflowFirebaseFulfillment = (req, res) => {
  console.log('request', req.body)
  res.setHeader('Content-Type', 'application/json');
  let response;
  const { action } = req.body.result;
  if (action === 'track_bus') {
    const { route, stops, direction } = req.body.result.parameters;
    const confirmation = checkRoute(route, direction, stops);
    if (confirmation.valid) {
      const stopIds = getStopId(route, direction, stops);
      switch (stopIds.length) {
        case 0:
          response = 'I couldn\'t find your stop. It\'s usually easiest to find it with the stop\'s cross street, but sometimes a landmark or street address will work for stops without an intersecting street, such as Orange line or 3800 South Wentworth';
          res.send(JSON.stringify({
            "speech": response, "displayText": response
          }));
          break;
        case 1:
          const stopId = stopIds[0];
          helpers.getArrivals(stopId, route)
            .then(arrivals => {
              response = formatText(arrivals)
              res.send(JSON.stringify({
                "speech": response, "displayText": response
              }));
            })
          break;
        default:
          response = 'Which stop? ' + stopIds.map(id => {
            return allRoutesLowerCase[route][direction][id]
          }).join(' or ') + '?';
          res.send(JSON.stringify({
            "speech": response, "displayText": response
          }));
      }
    } else {
      res.send(JSON.stringify({
        "speech": confirmation.response, "displayText": confirmation.response
      }));
    }
  }
};

function checkRoute(route, direction) {
  let valid = false;
  let response = '';
  if (!routeMap[route]) {
    response = `I couldn\'t find route ${route}. Try again with a different route.`;
  } else if (!routeMap[route][direction]) {
    const directions = Object.keys(routeMap[route]);
    response = `Route ${route} doesn't go ${direction}. It goes ${directions.join(', and ')}. Try again with a different route or direction.`
  } else {
    valid = true;
  }
  return {
    valid,
    response
  }
}

function getStopId(route, direction, stopKeywords) {
  const stopIds = stopKeywords.map(keyword => {
    const stopId = routeMap[route][direction][keyword];
    return stopId ? stopId : null;
  }).filter((id, index, self) => {
    return self.indexOf(id) === index && id !== null;
  })
  return stopIds;
}

function formatWithMinutes(arrival) {
  return arrival == '1' ? `${arrival} minute` : `${arrival} minutes`;
}

function calculateDelay(arrival) {
  return moment(arrival.prdtm, 'YYYYMMDD HH:mm').diff(moment(arrival.tmstmp, 'YYYYMMDD HH:mm'), 'm').toString()
}

function convertToMinutes(arrivals) {
  return arrivals.map((arrival, i) => {
    let response = '';
    if (i === arrivals.length - 1) {
      response = `and `
    }
    if (arrival.prdctdn.toLowerCase() === 'dly') {
      response += formatWithMinutes(calculateDelay(arrival));
    } else if (arrival.prdctdn.toLowerCase() === 'due') {
      response += '1 minute';
    } else {
      response += formatWithMinutes(arrival.prdctdn);
    }
    return response;
  }).join(', ');
}

function formatArrivals(arrivals) {
  const first = arrivals[0];
  const rest = arrivals.slice(1);
  const stopName = first.stpnm;
  let response = rest.length
    ? `${handleFirstBus(first, stopName)} ${handleRestOfBuses(rest)}`
    : `${handleFirstBus(first, stopName)} It\'s the last one coming for a while.`
  response += responseEnding();
  return response;
}

function responseEnding() {
  const responses = [
    // ' You can ask for an update or track another bus.',
    ' Anything else?',
    ' Can I track another bus for you?',
    // ' I\'ll keep listening in case you need an update',
    ' What else can I do for you?',
    ' Let me know if you need more help.',
    ' Can I help with another bus?',
    ' Is there anything else I can help with?',
    // ' If you want an update on your bus, let me know.',
    ' What else can I help you with?'
  ];
  const index = Math.floor(Math.random() * responses.length);
  return responses[index];
}

function handleFirstBus(arrival, stopName) {
  if (arrival.prdctdn.toLowerCase() === 'due') {
    return `Hurry! The next bus is due to arrive at ${stopName}.`;
  }
  if (arrival.prdctdn.toLowerCase() === 'dly') {
    return `The next bus is delayed, but it\'s estimated to arrive at ${stopName} in ${formatWithMinutes(calculateDelay(arrival))}.`
  }
  return `The next bus is arriving at ${stopName} in ${formatWithMinutes(arrival.prdctdn)}.`
}

function handleRestOfBuses(arrivals) {
  if (arrivals.length === 1) {
    const time = arrivals[0].prdctdn.toLowerCase();
    if (time === 'due') {
      return `The one after that is due too!`
    }
    if (time === 'dly') {
      return `The bus after that is delayed, but it's estimated to arrive in ${formatWithMinutes(calculateDelay(arrivals[0]))}.`
    }
    return `The bus after that is coming in ${formatWithMinutes(time)}.`
  } else {
    return `After that buses are arriving in ${convertToMinutes(arrivals)}.`
  }
}

function handleError(arrivalsObj) {
  const route = arrivalsObj.error[0].rt;
  const bool = arrivalsObj.error[0].msg === 'No arrival times';
  let response = bool ?
    `There are no upcoming arrivals`
    :
    `There is no scheduled service`;
  if (route) {
    response += ` for route ${route}`
  }
  return response + '. Can I help with another bus?';
}

function formatText(arrivals) {
  if (arrivals.error) {
    return handleError(arrivals);
  } else {
    return formatArrivals(arrivals.prd);
  }
}

