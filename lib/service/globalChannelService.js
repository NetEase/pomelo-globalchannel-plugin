var utils = require('../util/utils');
var redis = require('redis');
var countDownLatch = require('../util/countDownLatch');
var DefaultChannelManager = require('../manager/redisGlobalChannelManager');
var logger = require('pomelo-logger').getLogger(__filename);

var ST_INITED = 0;
var ST_STARTED = 1;
var ST_CLOSED = 2;

var DEFAULT_PREFIX = 'POMELO:CHANNEL';

/**
 * Global channel service.
 * GlobalChannelService is created by globalChannel component which is a default
 * component of pomelo enabled by `app.set('globalChannelConfig', {...})`
 * and global channel service would be accessed by
 * `app.get('globalChannelService')`.
 *
 * @class
 * @constructor
 */
var GlobalChannelService = function(app, opts) {
  this.app = app;
  this.opts = opts || {};
  this.manager = getChannelManager(app, opts);
  this.cleanOnStartUp = opts.cleanOnStartUp;
  this.state = ST_INITED;
};

module.exports = GlobalChannelService;

GlobalChannelService.prototype.start = function(cb) {
  if(this.state !== ST_INITED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  if(typeof this.manager.start === 'function') {
    var self = this;
    this.manager.start(function(err) {
      if(!err) {
        self.state = ST_STARTED;
      }
      if(!!self.cleanOnStartUp) {
        self.manager.clean(function(err) {
          utils.invokeCallback(cb, err);
        });
      } else {
        utils.invokeCallback(cb, err);
      }
    });
  } else {
    process.nextTick(function() {
      utils.invokeCallback(cb);
    });
  }
};

GlobalChannelService.prototype.stop = function(force, cb) {
  this.state = ST_CLOSED;

  if(typeof this.manager.stop === 'function') {
    this.manager.stop(force, cb);
  } else {
    process.nextTick(function() {
      utils.invokeCallback(cb);
    });
  }
};

/**
 * Destroy a global channel.
 *
 * @param  {String}   name global channel name
 * @param  {Function} cb callback function
 *
 * @memberOf GlobalChannelService
 */
GlobalChannelService.prototype.destroyChannel = function(name, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.destroyChannel(name, cb);
};

/**
 * Add a member into channel.
 *
 * @param  {String}   name channel name
 * @param  {String}   uid  user id
 * @param  {String}   sid  frontend server id
 * @param  {Function} cb   callback function
 *
 * @memberOf GlobalChannelService
 */
GlobalChannelService.prototype.add = function(name, uid, sid, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.add(name, uid, sid, cb);
};

/**
 * Remove user from channel.
 *
 * @param  {String}   name channel name
 * @param  {String}   uid  user id
 * @param  {String}   sid  frontend server id
 * @param  {Function} cb   callback function
 *
 * @memberOf GlobalChannelService
 */
GlobalChannelService.prototype.leave = function(name, uid, sid, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.leave(name, uid, sid, cb);
};

/**
 * Get members by frontend server id.
 *
 * @param  {String}   name channel name
 * @param  {String}   sid  frontend server id
 * @param  {Function} cb   callback function
 *
 * @memberOf GlobalChannelService
 */
GlobalChannelService.prototype.getMembersBySid = function(name, sid, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  this.manager.getMembersBySid(name, sid, cb);
};

/**
 * Get members by channel name.
 *
 * @param  {String}   stype frontend server type string
 * @param  {String}   name channel name
 * @param  {Function} cb   callback function
 *
 * @memberOf GlobalChannelService
 */
GlobalChannelService.prototype.getMembersByChannelName = function(stype, name, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }
  var members = [];
  var servers = this.app.getServersByType(stype);
  
  if(!servers || servers.length === 0) {
      utils.invokeCallback(cb, null, []);
      return;
  }

  var latch = countDownLatch.createCountDownLatch(servers.length, function() {
    utils.invokeCallback(cb, null, members);
    return;
  });

  for(var i=0, l=servers.length; i<l; i++) {
    this.getMembersBySid(name, servers[i].id, function(err, list) {
      if(err) {
        utils.invokeCallback(cb, err, null);
        return;
      } 
      if(list && list.length !== 0) {
        list.forEach(function(member) {
          members.push(member);
        });
      }
      latch.done();
    });
  }
};

/**
 * Send message by global channel.
 *
 * @param  {String}   serverType  frontend server type
 * @param  {String}   route       route string
 * @param  {Object}   msg         message would be sent to clients
 * @param  {String}   channelName channel name
 * @param  {Object}   opts        reserved
 * @param  {Function} cb          callback function
 *
 * @memberOf GlobalChannelService
 */
GlobalChannelService.prototype.pushMessage = function(serverType, route, msg,
    channelName, opts, cb) {
  if(this.state !== ST_STARTED) {
    utils.invokeCallback(cb, new Error('invalid state'));
    return;
  }

  var namespace = 'sys';
  var service = 'channelRemote';
  var method = 'pushMessage';
  var failIds = [];

  var self = this;
  var servers = this.app.getServersByType(serverType);

  if(!servers || servers.length === 0) {
    // no frontend server infos
    utils.invokeCallback(cb, null, failIds);
    return;
  }

  var successFlag = false;
  var latch = countDownLatch.createCountDownLatch(servers.length, function() {
    if(!successFlag) {
      utils.invokeCallback(cb, new Error('all frontend server push message fail'));
      return;
    }
     utils.invokeCallback(cb, null, failIds);
  });

  var rpcCB = function(err, fails) {
    if(err) {
      logger.error('[pushMessage] fail to dispatch msg, err:' + err.stack);
      latch.done();
      return;
    }
    if(fails) {
      failIds = failIds.concat(fails);
    }
    successFlag = true;
    latch.done();
  };


  for(var i=0, l=servers.length; i<l; i++) {
    (function(self, arg){
      self.getMembersBySid(channelName, servers[arg].id, function(err, uids) {
        if(err) {
          logger.error('[getMembersBySid] fail to get members, err' + err.stack);
        }
        if(uids && uids.length > 0) {
          self.app.rpcInvoke(servers[arg].id, {namespace: namespace, service: service,
            method: method, args: [route, msg, uids, {isPush: true}]}, rpcCB);
        } else {
          process.nextTick(rpcCB);
        }
      });
    })(this, i);
  }
};

var getChannelManager = function(app, opts) {
  var manager;
  if(typeof opts.channelManager === 'function') {
    manager = opts.channelManager(app, opts);
  } else {
    manager = opts.channelManager;
  }

  if(!manager) {
    manager = new DefaultChannelManager(app, opts);
  }

  return manager;
};
