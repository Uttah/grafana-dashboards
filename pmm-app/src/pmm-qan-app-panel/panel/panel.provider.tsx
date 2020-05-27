import React, { useEffect, useState } from 'react';
import { ParseQueryParamDate } from '../../react-plugins-deps/components/helpers/time-parameters-parser';
import { getDataSourceSrv } from '@grafana/runtime';
import { find, omit } from 'lodash';
import { DEFAULT_COLUMNS, FILTERS_NAMES } from './panel.constants';

const initialState = {} as any;

export const PanelProvider = React.createContext(initialState);

const setFilters = query =>
  FILTERS_NAMES.reduce((result, filterName) => {
    const filters = query.getAll(`var-${filterName}`);
    if (!filters.length) {
      return result;
    }

    result[filterName] = filters;
    return result;
  }, {});

const refreshGrafanaVariables = state => {
  const dataSource = getDataSourceSrv();
  // @ts-ignore
  const templateVariables = dataSource.templateSrv.variables;
  FILTERS_NAMES.forEach(filter => {
    const variables = find(templateVariables, { name: filter.replace('var-', '') });
    if (!variables) {
      return;
    }
    variables.current = {
      text: state.labels[filter] || ['All'],
      value: state.labels[filter] || ['All'],
    };
  });
  templateVariables[0].variableSrv.variableUpdated(templateVariables[0]);
};

const generateURL = state => {
  // read parameters and create new url
  const { labels, columns, groupBy, queryId, orderBy } = state;
  // @ts-ignore
  const urlLabels =
    labels &&
    Object.keys(labels)
      .map(key => {
        // @ts-ignore
        const variables = labels[key];
        return variables.map(variable => `var-${key}=${variable === 'na' ? '' : variable}`).join('&');
      })
      .filter(Boolean)
      .join('&');
  const urlColumnsQuery = columns ? `columns=${JSON.stringify(columns)}` : '';
  const urlGroupBy = groupBy ? `group_by=${groupBy}` : '';
  const urlFilterByQuery = queryId ? `filter_by=${queryId}` : '';
  const urlOrderBy = orderBy ? `order_by=${orderBy}` : '';
  const urlFrom = state.rawTime && state.rawTime.from ? `from=${state.rawTime.from}` : '';
  const urlTo = state.rawTime && state.rawTime.to ? `to=${state.rawTime.to}` : '';
  const totals = `totals=${state.totals}`;
  const querySelected = state.querySelected ? `query_selected=${state.querySelected}` : '';
  // TODO: replace crutch with right redirect
  return `${window.location.pathname}?${[
    urlColumnsQuery,
    urlFilterByQuery,
    urlLabels,
    urlOrderBy,
    urlGroupBy,
    urlFrom,
    urlTo,
    totals,
    querySelected,
  ]
    .filter(Boolean)
    .join('&')}`;
};

const parseURL = query => ({
  from: ParseQueryParamDate.transform(query.get('from') || 'now-12h', 'from'),
  to: ParseQueryParamDate.transform(query.get('to') || 'now', 'to')
    .utc()
    .format('YYYY-MM-DDTHH:mm:ssZ'),
  columns: JSON.parse(query.get('columns')) || DEFAULT_COLUMNS,
  labels: setFilters(query),
  pageNumber: 1,
  pageSize: 10,
  orderBy: query.get('order_by') || `-${(JSON.parse(query.get('columns')) || DEFAULT_COLUMNS)[0]}`,
  queryId: query.get('filter_by'),
  totals: query.get('totals') === 'true',
  querySelected: !!query.get('filter_by') || query.get('query_selected') === 'true',
  groupBy: query.get('group_by') || 'queryid',
});

const setLabels = filters =>
  Object.keys(filters)
    .filter(filter => filters[filter])
    .reduce((labels, filter) => {
      const [group, value] = filter.split(':');
      // TODO: using '--' because final form think that it is a nested fields
      //  need to replace it with something better
      if (labels[group]) {
        labels[group].push(value.replace(/\-\-/gi, '.').replace(/^na$/, ''));
      } else {
        labels[group] = [value.replace(/\-\-/gi, '.').replace(/^na$/, '')];
      }
      return labels;
    }, {});

const actions = {
  setLabels: value => state => {
    return omit({ ...state, labels: setLabels(value), pageNumber: 1 }, ['queryId', 'querySelected']);
  },
  resetLabels: value => state => {
    return omit({ ...state, labels: {}, pageNumber: 1 }, ['queryId', 'querySelected']);
  },
  selectQuery: (value, totals) => state => {
    return { ...state, queryId: value, querySelected: true, totals: totals };
  },
  addColumn: value => state => {
    const columns = [...state.columns];
    columns.push(value);
    return {
      ...state,
      columns,
    };
  },
  changeColumn: value => state => {
    const columns = [...state.columns];
    columns[columns.indexOf(value.oldColumn.simpleName)] = value.column;
    return {
      ...state,
      columns,
      orderBy:
        value.oldColumn.simpleName === state.orderBy.replace('-', '') ? `-${columns[0]}` : state.orderBy,
    };
  },
  removeColumn: value => state => {
    const columns = [...state.columns];
    columns.splice(columns.indexOf(value.simpleName), 1);
    return {
      ...state,
      columns,
      orderBy: value.simpleName === state.orderBy.replace('-', '') ? `-${columns[0]}` : state.orderBy,
    };
  },
  changePage: value => state => {
    return omit(
      {
        ...state,
        pageNumber: value,
      },
      ['queryId', 'querySelected']
    );
  },
  changePageSize: value => state => {
    return omit(
      {
        ...state,
        pageSize: value,
        pageNumber: 1,
      },
      ['queryId', 'querySelected']
    );
  },
  changeSort: value => state => {
    let newOrderBy = '';

    if (value === state.orderBy) {
      newOrderBy = `-${value}`;
    } else if (`-${value}` === state.orderBy) {
      newOrderBy = `${value}`;
    } else {
      newOrderBy = `-${value}`;
    }

    return omit(
      {
        ...state,
        orderBy: newOrderBy,
        pageNumber: 1,
      },
      ['queryId', 'querySelected']
    );
  },
  changeGroupBy: value => state => {
    return omit(
      {
        ...state,
        groupBy: value,
        querySelected: false,
        pageNumber: 1,
      },
      ['queryId', 'querySelected']
    );
  },
  closeDetails: value => state => {
    return omit(
      {
        ...state,
      },
      ['queryId', 'querySelected']
    );
  },
  setFingerprint: value => state => {
    return {
      ...state,
      fingerprint: value,
    };
  },
};

export const UrlParametersProvider = ({ grafanaProps, children }) => {
  const query = new URLSearchParams(window.location.search);
  const rawTime = { ...grafanaProps.timeRange.raw };
  const from = grafanaProps.timeRange.from.utc().format('YYYY-MM-DDTHH:mm:ssZ');
  const to = grafanaProps.timeRange.to.utc().format('YYYY-MM-DDTHH:mm:ssZ');
  const [panelState, setContext] = useState({
    ...parseURL(query),
    rawTime,
  });

  useEffect(() => {
    refreshGrafanaVariables(panelState);
    const newUrl = generateURL(panelState);
    history.pushState({}, 'test', newUrl);
  }, [panelState]);

  const wrapAction = key => (...value) => {
    return setContext(actions[key](...value));
  };

  const [isFirstLoad, setFirstLoad] = useState(true);
  useEffect(() => {
    if (isFirstLoad) {
      return;
    }
    const newState = { ...panelState, from, to, rawTime };

    if (panelState.rawTime.from !== rawTime.from || panelState.rawTime.to !== rawTime.to) {
      newState.pageNumber = 1;
      delete newState.queryId;
      delete newState.querySelected;
    }

    setContext(newState);
  }, [rawTime.from, rawTime.to]);

  // refresh
  useEffect(() => {
    const refreshButton = document.querySelector('.refresh-picker-buttons button');
    const refreshHandle = () => {
      const newState = { ...panelState, from, to, rawTime };
      if (panelState.rawTime.from !== rawTime.from || panelState.rawTime.to !== rawTime.to) {
        newState.pageNumber = 1;
        delete newState.queryId;
        delete newState.querySelected;
      }

      setContext(newState);
    };
    refreshButton && refreshButton.addEventListener('click', refreshHandle);

    return () => {
      refreshButton && refreshButton.removeEventListener('click', refreshHandle);
    };
  }, []);

  useEffect(() => {
    setFirstLoad(false);
  }, []);

  return (
    <PanelProvider.Provider
      value={{
        panelState: panelState,
        contextActions: Object.keys(actions).reduce((actions, key) => {
          actions[key] = wrapAction(key);
          return actions;
        }, {}),
      }}
    >
      {children}
    </PanelProvider.Provider>
  );
};
