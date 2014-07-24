pomelo-globalchannel-plugin
===========================

pomelo-globalchannel-plugin is a plugin for pomelo, it can be used in pomelo(>=0.6).

In pomelo, channel is an abstract concept which can be understood as a collection of users. In pomelo you can add users into a named channel, and push message to all users in this channel. But it only can be used in the same server, which means it does not support distributed environment.

The global channel solve this problem. It uses persistent storage to do this thing. You can use it to store users in distributed environment and do same things as local channel does in pomelo.


##Installation

```
npm install pomelo-globalchannel-plugin
```

##Usage

```
var globalChannel = require('pomelo-globalchannel-plugin');

app.use(globalChannel, {globalChannel: {
  host: '127.0.0.1',
  port: 6379,
  db: '0'       // optinal, from 0 to 15 with default redis configure
}});

```

##API

###add(name, uid, sid, cb)
add a member into channel
####Arguments
+ name - channel name.
+ uid - user id.
+ sid - frontend server id
+ cb - callback function

###leave(name, uid, sid, cb)
remove user from channel
####Arguments
+ name - channel name.
+ uid - user id.
+ sid - frontend server id
+ cb - callback function

###getMembersBySid(name, sid, cb)
get members by frontend server id
####Arguments
+ name - channel name
+ sid - frontend server id
+ cb - callback function

###getMembersByChannelName(stype, name, cb)
get members by channel name
####Arguments
+ stype - frontend server type string
+ name - channel name
+ cb callback function

###pushMessage(stype, route, msg, name, opts, cb)
send message by global channel
####Arguments
+ stype - frontend server type string
+ route - route string
+ msg - message would be sent to clients
+ name - channel name
+ opts - optional parameters
+ cb - callback function

###destroyChannel(name, cb)
destroy a global channel
####Arguments
+ name - channel name
+ cb - callback function

##Notice

Global channel use redis as a default persistent storage, you can change it with your own implementation.

```
var globalChannel = require('pomelo-globalchannel-plugin');
var mysqlGlobalChannelManager = require('./mysqlGlobalChannelManager');

app.use(globalChannel, {globalChannel: {
  host: '127.0.0.1',
  port: 6379,
  channelManager: mysqlGlobalChannelManager
}});

```

