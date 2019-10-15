const routeMap = require('./data/routesWithKeywords_4');
const allRoutesLowerCase = require('./data/allRoutesLowerCase');
const helpers = require('./helpers');
const moment = require('moment');

const functions = require('firebase-functions');
const { dialogflow } = require('actions-on-google');

const admin = require('firebase-admin');

const serviceAccount = require('./config/fbKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chicagobustracker.firebaseio.com',
});

const trackBus = conv => {
  const { route, stops, direction } = conv.body.queryResult.parameters;
  const query = conv.body.queryResult.queryText;
  console.log('query:', query);
  console.log('route:', route);
  console.log('direction:', direction);
  console.log('stops:', stops);
  const confirmation = checkRoute(
    route.toLowerCase(),
    direction.toLowerCase(),
    stops
  );
  if (confirmation.valid) {
    const stopIds = getStopId(
      route.toLowerCase(),
      direction.toLowerCase(),
      stops
    );
    switch (stopIds.length) {
      case 0:
        conv.contexts.set('request_location', 1);
        conv.askForPermission(
          "I'm having trouble finding your stop",
          conv.SupportedPermissions.DEVICE_PRECISE_LOCATION
        );
        break;
      case 1:
        const stopId = stopIds[0];
        return helpers.getArrivals(stopId, route).then(arrivals => {
          const { response, error, firstArrivalTime } = formatText(arrivals);
          console.log('response: ', response);
          conv.ask(response);
        });
        break;
      default:
        response = `Which stop? ${stopIds
          .map(id => {
            return allRoutesLowerCase[route][direction][id];
          })
          .join(' or ')}?`;
        console.log('response: ', response);
        conv.contexts.set('stop_clarification', 1);
        conv.ask(response);
    }
  } else {
    console.log('response invalid route: ', confirmation.response);
    conv.ask(confirmation.response);
  }
};

const requestPermission = conv => {
  conv.askForPermission(
    'To find your stop',
    conv.SupportedPermissions.DEVICE_PRECISE_LOCATION
  );
};

const userInfo = conv => {
  if (conv.isPermissionGranted()) {
    const location = conv.getDeviceLocation();
    const { route, direction } = conv.getContext('bus_data').parameters;
    console.log('location', location);
    console.log('route', route);
    console.log('direction', direction);
    const data = helpers.getClosestStop(location, route, direction);
    let newResponse = '';
    if (data.stopFound) {
      const stopId = data.stop.id;
      helpers.getArrivals(stopId, route).then(arrivals => {
        const { response } = formatText(arrivals);
        newResponse = `The closest stop to you is ${data.stop.name}. ${response}`;
        console.log('response', newResponse);
        conv.ask(newResponse);
      });
    } else {
      newResponse =
        !location.city || location.city.toLowerCase() === 'chicago'
          ? `I\'m sorry, it doesn\'t look like you\'re close to a stop along route ${route} in Chicago. You might want to order a Lyft...`
          : `Sorry, Track My Bus doesn't work in ${location.city} at the moment. It only works in Chicago.`;
      console.log('response', newResponse);
      conv.tell(newResponse);
    }
  } else {
    console.log('PERMISSION DENIED');
    conv.tell('Sorry, I could not figure out where you are.');
  }
};

const app = dialogflow();

app.intent('track_bus', trackBus);

app.intent('request_permission', conv => {
  requestPermission(conv);
});
app.intent('user_info', conv => {
  userInfo(conv);
});

exports.testFulfillment = functions.https.onRequest(app);

function checkRoute(route, direction) {
  let valid = false;
  let response = '';
  if (!routeMap[route]) {
    response = `I couldn\'t find route ${route}. Try again with a different route.`;
  } else if (!routeMap[route][direction]) {
    const directions = Object.keys(routeMap[route]);
    response = `CTA route ${route} doesn't go ${direction}. It goes ${directions.join(
      ', and '
    )}. Track my bus only works in Chicago at the moment. try again with a different route or direction.`;
  } else {
    valid = true;
  }
  return {
    valid,
    response,
  };
}

function getStopId(route, direction, stopKeywords) {
  const stopIds = stopKeywords
    .map(keyword => {
      const stopId = routeMap[route][direction][keyword.toLowerCase()];
      return stopId || null;
    })
    .filter((id, index, self) => self.indexOf(id) === index && id !== null);
  return stopIds;
}

function formatWithMinutes(arrival) {
  return arrival == '1' ? `${arrival} minute` : `${arrival} minutes`;
}

function calculateDelay(arrival) {
  return moment(arrival.prdtm, 'YYYYMMDD HH:mm')
    .diff(moment(arrival.tmstmp, 'YYYYMMDD HH:mm'), 'm')
    .toString();
}

function convertToMinutes(arrivals) {
  return arrivals
    .map((arrival, i) => {
      let response = '';
      if (i === arrivals.length - 1) {
        response = 'and ';
      }
      if (arrival.prdctdn.toLowerCase() === 'dly') {
        response += formatWithMinutes(calculateDelay(arrival));
      } else if (arrival.prdctdn.toLowerCase() === 'due') {
        response += '1 minute';
      } else {
        response += formatWithMinutes(arrival.prdctdn);
      }
      return response;
    })
    .join(', ');
}

function formatArrivals(arrivals) {
  const first = arrivals[0];
  const rest = arrivals.slice(1);
  const stopName = first.stpnm;
  const route = first.rt;
  const direction = first.rtdir;
  const firstArrivalTime =
    first.prdctdn.toLowerCase() === 'due' ? 0 : +first.prdctdn;
  let response = rest.length
    ? `${handleFirstBus(
        first,
        stopName,
        route,
        direction,
        direction
      )} ${handleRestOfBuses(rest)}`
    : `${handleFirstBus(
        first,
        stopName,
        route,
        direction,
        direction
      )} It\'s the last one coming for a while.`;
  response += responseEnding();
  return {
    response,
    error: false,
    firstArrivalTime,
  };
}

function responseEnding() {
  const responses = [
    // ' You can ask for an update or track another bus.',
    ' Anything else?',
    ' Can I track another bus for you?',
    // ' I\'ll keep listening in case you need an update',
    // ' What else can I do for you?',
    // ' Let me know if you need more help.',
    ' Can I help with another bus?',
    ' Is there anything else I can help with?',
    // ' If you want an update on your bus, let me know.',
    // ' What else can I help you with?'
  ];
  const index = Math.floor(Math.random() * responses.length);
  return responses[index];
}

function handleFirstBus(arrival, stopName, route, direction) {
  if (arrival.prdctdn.toLowerCase() === 'due') {
    return `Hurry! The next ${route} bus is about to arrive at ${stopName}.`;
  }
  if (arrival.prdctdn.toLowerCase() === 'dly') {
    return `The next bus is delayed, but it\'s estimated to arrive at ${stopName} in ${formatWithMinutes(
      calculateDelay(arrival)
    )}.`;
  }
  return `${formatWithMinutes(
    arrival.prdctdn
  )} until the ${direction.toLowerCase()} ${route} bus arrives at ${stopName}.`;
}

function handleRestOfBuses(arrivals) {
  if (arrivals.length === 1) {
    const time = arrivals[0].prdctdn.toLowerCase();
    if (time === 'due') {
      return 'The one after that is due too!';
    }
    if (time === 'dly') {
      return `The bus after that is delayed, but it's estimated to arrive in ${formatWithMinutes(
        calculateDelay(arrivals[0])
      )}.`;
    }
    return `The bus after that is coming in ${formatWithMinutes(time)}.`;
  }
  return `After that buses are arriving in ${convertToMinutes(arrivals)}.`;
}

function handleError(arrivalsObj) {
  console.log(`$$>>>>: handleError -> arrivalsObj`, arrivalsObj);
  const route = arrivalsObj.error[0].rt;
  const bool = arrivalsObj.error[0].msg === 'No arrival times';
  let response = bool
    ? 'There are no upcoming arrivals'
    : 'There is no scheduled service';
  if (route) {
    response += ` for route ${route}`;
  }
  return {
    response: `${response}. Can I help with another bus?`,
    error: true,
  };
}

function formatText(arrivals) {
  if (arrivals.error) {
    return handleError(arrivals);
  }
  return formatArrivals(arrivals.prd);
}
