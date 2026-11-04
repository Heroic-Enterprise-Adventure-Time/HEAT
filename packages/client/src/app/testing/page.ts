import { type ByRoleMatcher, screen, within } from '@testing-library/angular/zoneless';

import { must } from '@heat/engine';

/** The panel beside the scene, as an element and to query within. */
export const panelBox = () => screen.getByRole('complementary');
export const panel = () => within(panelBox());

/** The camp's menu of facilities, to query within. */
export const menu = () => within(screen.getByRole('navigation', { name: 'Facilities' }));

/** The items of the panel's list of that name. */
export const listItems = (list: string) => within(panel().getByRole('list', { name: list })).getAllByRole('listitem');

/** The item of the panel's list of that name that holds the given element. */
export const itemHolding = (list: string, role: ByRoleMatcher, name: string) =>
  must(listItems(list).find((item) => within(item).queryByRole(role, { name })), `the item of ${list} holding ${name}`);
