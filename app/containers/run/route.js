import EmberObject from '@ember/object';
import { inject as service } from '@ember/service';
import { get, set } from '@ember/object';
import { hash, resolve } from 'rsvp';
import Route from '@ember/routing/route';
import Ember from 'ember';
import C from 'ui/utils/constants';

export default Route.extend({
  prefs: service(),
  clusterStore: service(),
  globalStore: service(),

  queryParams: {
    launchConfigIndex: {
      refreshModel: true
    }
  },

  model: function (params/*, transition*/) {
    var store = get(this, 'store');

    const gs = get(this, 'globalStore');
    const project = window.l('route:application').modelFor('authenticated.project').get('project');
    const projectId = project.get('id');
    const clusterId = project.get('clusterId');

    const clusterLogging = gs.find('clusterLogging').then((res) => {
      const logging = res.filterBy('clusterId', clusterId).get('firstObject');
      return !!logging;
    });

    const projectLogging = gs.find('projectLogging').then((res) => {
      const logging = res.filterBy('projectId', projectId).get('firstObject');
      return !!logging;
    });

    let promise = null;
    if (params.workloadId) {
      // Existing Service
      promise = store.find('workload', params.workloadId).then((workload) => {
        return this.modelForExisting(workload, params);
      });
    } else {
      promise = resolve(this.modelForNew(params));
    }

    return hash({
      dataMap: promise,
      clusterLogging,
      projectLogging,
    }).then(hash => {
      return {
        loggingEnabled: hash.clusterLogging || hash.projectLogging,
        dataMap: hash.dataMap,
      }
    })
  },

  modelForNew(params) {
    let scaleMode = get(this, `prefs.${C.PREFS.LAST_SCALE_MODE}`) || 'deployment';
    if (scaleMode === 'container' || scaleMode === 'service') {
      scaleMode = 'deployment';
    }

    return EmberObject.create({
      scaleMode,
      workload: this.emptyWorkload(params),
      container: this.emptyContainer(params),
      isUpgrade: false,
    });
  },

  modelForExisting(_workload, params) {
    if (!_workload) {
      return Ember.RVP.reject('Workload not found');
    }

    const clone = _workload.clone();

    const containerNames = clone.containers.map(x => get(x, 'name'));
    let containerName = null;

    if (params.launchConfigIndex !== null) {
      const launchConfigIndex = parseInt(params.launchConfigIndex, 10)
      if (launchConfigIndex > -1) {
        containerName = clone.containers[launchConfigIndex + 1].name;
      } else if (launchConfigIndex === -1) {
        containerName = '';
      }
    }

    // Add a sidekick
    if (params.addSidekick) {
      return EmberObject.create({
        scaleMode: 'sidekick',
        workload: clone,
        container: this.emptyContainer(params, get(clone, 'namespaceId')),
        isUpgrade: false,
      });
    } else if (containerName === null) {
      // Figure out the container name
      if (containerNames.length > 1) {
        if (params.upgrade) {
          // If there are sidekicks, you need to pick one & come back
          return EmberObject.create({
            workload: clone,
            containerNames,
            selectLaunchConfig: true,
          });
        } else {
          // Clone with multiple containers not supported yet
          return Ember.RVP.reject("Cloning a workload with multiple containers not supported");
        }
      } else {
        // Otherwise use primary
        containerName = "";
      }
    }

    let container;
    if (containerName === "") {
      // The primary/only container
      container = clone.containers[0];
    } else {
      // Existing container
      container = clone.containers.findBy('name', containerName);
    }

    if (params.upgrade) {
      // Upgrade workload
      let out = EmberObject.create({
        scaleMode: (containerName ? 'sidekick' : clone.type),
        workload: clone,
        container,
        isUpgrade: true
      });

      return out;
    } else {
      // Clone workload with one container
      let neu = get(this, 'store').createRecord(clone.serializeForNew());

      return EmberObject.create({
        scaleMode: clone.type,
        workload: neu,
        container,
        isUpgrade: false
        // no launchConfigIndex because this will be a new service or sidekick
      });
    }
  },

  getNamespaceId(params) {
    const clusterStore = get(this, 'clusterStore');

    let ns = null;
    if (params.namespaceId) {
      ns = clusterStore.getById('namespace', params.namespaceId);
    }

    if (!ns) {
      ns = clusterStore.getById('namespace', get(this, `prefs.${C.PREFS.LAST_NAMESPACE}`));
    }

    let namespaceId = null;
    if (ns) {
      namespaceId = ns.get('id');
    }
    return namespaceId;
  },

  emptyWorkload(params) {
    const store = get(this, 'store');
    return store.createRecord({
      type: 'workload',
      namespaceId: this.getNamespaceId(params),
      scale: 1,
      dnsPolicy: "ClusterFirst",
      restartPolicy: "Always",
      labels: {},
      containers: [],
    });
  },

  emptyContainer(params, namespaceId) {
    return get(this, 'store').createRecord({
      type: 'container',
      tty: true,
      stdin: true,
      privileged: false,
      allowPrivilegeEscalation: false,
      readOnly: false,
      runAsNonRoot: false,
      namespaceId: namespaceId ? namespaceId : this.getNamespaceId(params),
      pullPolicy: 'Always',
    });
  },

  resetController(controller, isExiting/*, transition*/) {
    if (isExiting) {
      set(controller, 'namespaceId', null);
      set(controller, 'workloadId', null);
      set(controller, 'podId', null);
      set(controller, 'upgrade', null);
      set(controller, 'addSidekick', null);
      set(controller, 'launchConfigIndex', null);
    }
  }
});
