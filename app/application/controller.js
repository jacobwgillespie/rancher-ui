import { oneWay } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import Controller from '@ember/controller';
import { run } from '@ember/runloop';
import { observer } from '@ember/object';

export default Controller.extend({
  settings: service(),

  // GitHub auth params
  queryParams:       ['isPopup','redirectTo', 'fromAuthProvider'],

  resourceActions:   service('resource-actions'),
  tooltipService:    service('tooltip'),

  tooltip:           oneWay('tooltipService.tooltipOpts.type'),
  tooltipTemplate:   oneWay('tooltipService.tooltipOpts.template'),

  error:             null,
  error_description: null,
  state:             null,
  code:              null,
  isPopup:           null,
  redirectTo:        null,

  init() {
    this._super(...arguments);

    if ( this.get('app.environment') === 'development' ) {
      run.backburner.DEBUG = true;
    }
  },

  // currentRouteName is set by Ember.Router
  // but getting the application controller to get it is inconvenient sometimes
  currentRouteNameChanged: observer('currentRouteName', function() {
    this.set('app.currentRouteName', this.get('currentRouteName'));
  }),

});
