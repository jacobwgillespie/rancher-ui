import { computed, get } from '@ember/object';
import { or } from '@ember/object/computed';
import Resource from 'ember-api-store/models/resource';
import { download } from 'shared/utils/util';
import C from 'ui/utils/constants';
import StateCounts from 'ui/mixins/state-counts';
import { inject as service } from "@ember/service";
import { reference } from 'ember-api-store/utils/denormalize';
import ResourceUsage from 'shared/mixins/resource-usage';

var Node = Resource.extend(StateCounts, ResourceUsage, {
  type: 'node',

  modalService: service('modal'),
  settings: service(),
  prefs: service(),
  router: service(),
  globalStore: service(),
  clusterStore: service(),
  intl: service(),

  cluster: reference('clusterId','cluster'),
  nodePool: reference('nodePoolId'),

  init() {
    this._super(...arguments);
    this.defineStateCounts('arrangedInstances', 'instanceStates', 'instanceCountSort');
  },

  actions: {
    activate: function() {
      return this.doAction('activate');
    },

    deactivate: function() {
      return this.doAction('deactivate');
    },

    cordon: function() {
      return this.doAction('cordon');
    },

    uncordon: function() {
      return this.doAction('uncordon');
    },

    drain: function() {
      return this.doAction('drain');
    },

    promptEvacuate: function() {
      get(this,'modalService').toggleModal('modal-host-evacuate', {
        model: [this]
      });
    },

    evacuate: function() {
      return this.doAction('evacuate');
    },

    newContainer: function() {
      get(this,'router').transitionTo('containers.run', {queryParams: {hostId: get(this,'model.id')}});
    },

    edit: function() {
      get(this,'modalService').toggleModal('modal-edit-host', this);
    },

    nodeConfig: function() {
      var url = this.linkFor('nodeConfig');
      if ( url )
      {
        download(url);
      }
    }
  },

  availableActions: computed('links.{nodeConfig}', 'actionLinks.{cordon,uncordon,drain}', function() {
    let l = get(this,'links');
    const a = get(this, 'actionLinks');

    let out = [
      { label: 'action.cordon', icon: 'icon icon-pause', action: 'cordon', enabled: !!a.cordon, bulkable: true},
      { label: 'action.uncordon', icon: 'icon icon-play', action: 'uncordon', enabled: !!a.uncordon, bulkable: true},
      { label: 'action.drain', icon: 'icon icon-snapshot', action: 'drain', enabled: !!a.drain, bulkable: true},
      { divider: true},
      { label: 'action.nodeConfig', icon: 'icon icon-download', action: 'nodeConfig', enabled: !!l.nodeConfig},
      { divider: true },
    ];

    return out;
  }),

  displayIp: or('externalIpAddress','ipAddress'),

  displayName: computed('name','nodeName','requestedHostname','id', function() {
    let name = get(this,'name');
    if ( name ) {
      return name;
    }

    name = get(this,'nodeName');
    if ( name ) {
      if ( name.match(/[a-z]/i) ) {
        name = name.replace(/\..*$/,'');
      }

      return name;
    }

    name = get(this,'requestedHostname');
    if ( name ) {
      return name;
    }

    return '('+get(this,'id')+')';
  }),

  rolesArray: computed('etcd','controlPlane','worker', function() {
    return ['etcd','controlPlane','worker'].filter(x => !!get(this,x));
  }),

  displayRoles: computed('intl.locale','rolesArray.[]', function() {
    const intl = get(this, 'intl');
    const roles = get(this, 'rolesArray');

    if ( roles.length >= 3 ) {
      return [intl.t('generic.all')];
    }

    return roles.map(role => {
      let key = `model.machine.role.${role}`;
      if ( intl.exists(key) ) {
        return intl.t(key);
      }

      return key;
    });
  }),

  sortRole: computed('rolesArray.[]', function() {
    let roles = get(this, 'rolesArray');

    if ( roles.length >= 3 ) {
      return 1;
    }

    if ( roles.includes('controlPlane') ) {
      return 2;
    }

    if ( roles.includes('etcd') ) {
      return 3;
    }

    return 4;
  }),

  isUnschedulable: computed('taints.@each.{effect,key}', function(){
    const taints = get(this, 'taints') || [];
    return taints.some(taint=> taint.effect === 'NoExecute' && taint.key === 'node-role.kubernetes.io/etcd');
  }),

  osBlurb: computed('info.os.operatingSystem', function() {
    var out = get(this,'info.os.operatingSystem')||'';

    out = out.replace(/\s+\(.*?\)/,''); // Remove details in parens
    out = out.replace(/;.*$/,''); // Or after semicolons
    out = out.replace('Red Hat Enterprise Linux Server','RHEL'); // That's kinda long

    return out;
  }),

/*
  osBlurb: function() {
    var out = get(this,'info.osInfo.operatingSystem')||'';

    out = out.replace(/\s+\(.*?\)/,''); // Remove details in parens
    out = out.replace(/;.*$/,''); // Or after semicolons
    out = out.replace('Red Hat Enterprise Linux Server','RHEL'); // That's kinda long

    var hasKvm = (get(this,'labels')||{})[C.LABEL.KVM] === 'true';
    if ( hasKvm && out )
    {
      out += ' (with KVM)';
    }

    return out;
  }.property('info.osInfo.operatingSystem','labels'),

  osDetail: alias('info.osInfo.operatingSystem'),

  dockerEngineVersion: function() {
    if ( get(this,'info.osInfo') )
    {
*/
//      return (get(this,'info.osInfo.dockerVersion')||'').replace(/^Docker version\s*/i,'').replace(/,.*/,'');
/*    }
  }.property('info.osInfo.dockerVersion'),

  supportState: function() {
    let my = get(this,'dockerEngineVersion')||'';
    my = my.replace(/-(cs|ce|ee)[0-9.-]*$/,'');

    let supported = get(this,`settings.${C.SETTING.SUPPORTED_DOCKER}`);
    let newest = get(this,`settings.${C.SETTING.NEWEST_DOCKER}`);

    if ( !my || !supported || !newest) {
      return 'unknown';
    } else if ( satisfies(my, supported) ) {
      return 'supported';
    } else if ( compare(my, newest) > 0 ) {
      return 'untested';
    } else {
      return 'unsupported';
    }
  }.property('dockerEngineVersion',`settings.${C.SETTING.SUPPORTED_DOCKER}`,`settings.${C.SETTING.NEWEST_DOCKER}`),

  dockerDetail: alias('info.osInfo.operatingSystem'),

  kernelBlurb: function() {
    if ( get(this,'info.osInfo') )
    {
      return (get(this,'info.osInfo.kernelVersion')||'');
    }
  }.property('info.osInfo.kernelVersion'),

  cpuBlurb: function() {
    if ( get(this,'info.cpuInfo.count') )
    {
      var ghz = Math.round(get(this,'info.cpuInfo.mhz')/10)/100;

      if ( get(this,'info.cpuInfo.count') > 1 )
      {
        return get(this,'info.cpuInfo.count')+'x' + ghz + ' GHz';
      }
      else
      {
        return ghz + ' GHz';
      }
    }
  }.property('info.cpuInfo.{count,mhz}'),

  cpuTooltip: alias('info.cpuInfo.modelName'),

  memoryBlurb: function() {
    if ( get(this,'info.memoryInfo') )
    {
      return formatMib(get(this,'info.memoryInfo.memTotal'));
    }
  }.property('info.memoryInfo.memTotal'),

  memoryLimitBlurb: computed('memory', function() {
    if ( get(this,'memory') )
    {
      return formatSi(get(this,'memory'), 1024, 'iB', 'B');
    }
  }),

  localStorageBlurb: computed('localStorageMb', function() {
    if (get(this,'localStorageMb')) {
      return formatSi(get(this,'localStorageMb'), 1024, 'iB', 'B', 2); // start at 1024^2==MB
    }
  }),

  diskBlurb: function() {
    var totalMb = 0;

    // New hotness
    if ( get(this,'info.diskInfo.fileSystems') )
    {
      var fses = get(this,'info.diskInfo.fileSystems')||[];
      Object.keys(fses).forEach((fs) => {
        totalMb += fses[fs].capacity;
      });

      return formatMib(totalMb);
    }
    else if ( get(this,'info.diskInfo.mountPoints') )
    {
      // Old & busted
      var mounts = get(this,'info.diskInfo.mountPoints')||[];
      Object.keys(mounts).forEach((mountPoint) => {
        totalMb += mounts[mountPoint].total;
      });

      return formatMib(totalMb);
    }
  }.property('info.diskInfo.mountPoints.@each.total','info.diskInfo.fileSystems.@each.capacity'),

  diskDetail: function() {
    // New hotness
    if ( get(this,'info.diskInfo.fileSystems') )
    {
      var out = [];
      var fses = get(this,'info.diskInfo.fileSystems')||[];
      Object.keys(fses).forEach((fs) => {
        out.pushObject(EmberObject.create({label: fs, value: formatMib(fses[fs].capacity)}));
      });

      return out;
    }
  }.property('info.diskInfo.fileSystems.@each.capacity'),
*/

  // If you use this you must ensure that services and containers are already in the store
  //  or they will not be pulled in correctly.
  displayEndpoints: function() {
    var store = get(this,'clusterStore');
    return (get(this,'publicEndpoints')||[]).map((endpoint) => {
      if ( !endpoint.service ) {
        endpoint.service = store.getById('service', endpoint.serviceId);
      }

      endpoint.instance = store.getById('instance', endpoint.instanceId);
      return endpoint;
    });
  }.property('publicEndpoints.@each.{ipAddress,port,serviceId,instanceId}'),

  requireAnyLabelStrings: function() {
    return  ((get(this,'labels')||{})[C.LABEL.REQUIRE_ANY]||'')
              .split(/\s*,\s*/)
              .filter((x) => x.length > 0 && x !== C.LABEL.SYSTEM_TYPE);
  }.property(`labels.${C.LABEL.REQUIRE_ANY}`),
});

Node.reopenClass({
  defaultSortBy: 'name,hostname',
});

export default Node;
