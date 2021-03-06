/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import boom from 'boom';
import { isSecurityEnabled } from './feature_check';
import { SECURITY_AUTH_MESSAGE } from '../../common/constants';

export const createHandlers = (request, server) => {
  const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');
  const config = server.config();

  return {
    environment: 'server',
    // TODO: https://github.com/elastic/kibana/issues/27437 - A temporary measure to allow the timelion data source to negotiate secure connections to the Kibana server, to be removed by 6.7
    // See https://github.com/elastic/kibana/pull/26809 and https://github.com/elastic/kibana/issues/26812
    __dangerouslyUnsupportedSslConfig: server.config().get('server.ssl'),
    serverUri:
      config.has('server.rewriteBasePath') && config.get('server.rewriteBasePath')
        ? `${server.info.uri}${config.get('server.basePath')}`
        : server.info.uri,
    httpHeaders: request.headers,
    elasticsearchClient: async (...args) => {
      // check if the session is valid because continuing to use it
      if (isSecurityEnabled(server)) {
        try {
          const authenticationResult = await server.plugins.security.authenticate(request);
          if (!authenticationResult.succeeded()) {
            throw boom.unauthorized(authenticationResult.error);
          }
        } catch (e) {
          // if authenticate throws, show error in development
          if (process.env.NODE_ENV !== 'production') {
            e.message = `elasticsearchClient failed: ${e.message}`;
            console.error(e);
          }

          // hide all failure information from the user
          throw boom.unauthorized(SECURITY_AUTH_MESSAGE);
        }
      }

      return callWithRequest(request, ...args);
    },
  };
};
